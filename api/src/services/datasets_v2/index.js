const assert = require('assert');
// const path = require('node:path');

const config = require('config');
const createError = require('http-errors');
const _ = require('lodash/fp');
const prisma = require('@/db');
const { assertPossible, withStateFields } = require('@/state').import('dataset');
const wfService = require('@/services/workflow');

const {
  DONE_STATUSES, INCLUDE_WORKFLOWS,
} = require('@/constants');

const fetchModule = require('./fetch');
const createModule = require('./create');
const useConditionsModule = require('./useConditions');
const attributionModule = require('./attribution');
const ownershipModule = require('./ownership');

// ── Helpers ─────────────────────────────────────────────────────────────────

function get_wf_body(wf_name) {
  assert(config.workflow_registry.has(wf_name), `${wf_name} workflow is not registered`);
  const wf_body = { ...config.workflow_registry[wf_name] };
  wf_body.name = wf_name;
  wf_body.app_id = config.app_id;
  wf_body.steps = wf_body.steps.map((step) => ({
    ...step,
    queue: step.queue || `${config.app_id}.q`,
  }));
  return wf_body;
}

// Internal helper: create a workflow and associate it with a dataset.
// Requires dataset.workflows to be populated.
async function createWorkflowForDataset({ dataset, wf_name, initiator_id }) {
  const wf_body = get_wf_body(wf_name);

  const active_same_name = dataset.workflows
    .filter((w) => w.name === wf_body.name)
    .filter((w) => !DONE_STATUSES.includes(w.status));

  assert(active_same_name.length === 0, 'A workflow with the same name is either pending / running');

  const wf = (await wfService.create({ ...wf_body, args: [dataset.id] })).data;

  await prisma.workflow.create({
    data: {
      id: wf.workflow_id,
      dataset_id: dataset.id,
      ...(initiator_id && { initiator_id }),
    },
  });

  return wf;
}

/**
 * Returns aggregate statistics across (optionally filtered) datasets.
 */
async function getStats(type) {
  let result;
  let n_wf_result;

  if (type) {
    result = await prisma.$queryRaw`
      select count(*)     as "count",
             sum(du_size) as total_size,
             SUM(CASE WHEN metadata -> 'num_genome_files' IS NOT NULL
                      THEN (metadata ->> 'num_genome_files')::int
                      ELSE 0 END) AS total_num_genome_files
      from dataset
      where is_deleted = false and type = ${type};
    `;
    n_wf_result = await prisma.workflow.aggregate({
      where: { dataset: { type } },
      _count: { id: true },
    });
  } else {
    result = await prisma.$queryRaw`
      select count(*)     as "count",
             sum(du_size) as total_size,
             SUM(CASE WHEN metadata -> 'num_genome_files' IS NOT NULL
                      THEN (metadata ->> 'num_genome_files')::int
                      ELSE 0 END) AS total_num_genome_files
      from dataset
      where is_deleted = false;
    `;
    n_wf_result = await prisma.workflow.aggregate({ _count: { id: true } });
  }

  return {
    ..._.mapValues(Number)(result[0]),
    workflows: n_wf_result?._count.id || 0,
  };
}

/**
 * Locks a dataset row, then reads it with the fields its state rules read.
 *
 * The lock comes first, so the state a write sees is the state the check read. A raw lock cannot
 * take the state layer's select fragment, so the row is read after it rather than by it.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {number} dataset_row_id - the dataset's numeric id
 * @param {object} [include] - relations to read along with the row
 * @returns {Promise<object>} every column of the dataset, and the state fields
 * @throws {HttpError} 404 when no dataset has that id
 */
async function lockDataset(tx, dataset_row_id, include = {}) {
  const rows = await tx.$queryRaw`SELECT id FROM dataset WHERE id = ${dataset_row_id} FOR UPDATE`;
  if (rows.length === 0) throw createError.NotFound('Dataset not found');
  return tx.dataset.findUniqueOrThrow(withStateFields({ where: { id: dataset_row_id }, include }));
}

/**
 * Partially updates a dataset. Merges metadata and handles bundle upsert.
 */
async function patchDataset(dataset_row_id, data) {
  return prisma.$transaction(async (tx) => {
    const current = await lockDataset(tx, dataset_row_id);
    assertPossible('edit_metadata', current);
    const { metadata, bundle, ...rest } = data;

    const updateData = _.omitBy(_.isUndefined)(rest);
    updateData.metadata = _.merge(current.metadata)(metadata);

    if (bundle) {
      updateData.bundle = { upsert: { create: bundle, update: bundle } };
    }

    return tx.dataset.update({
      where: { id: dataset_row_id },
      data: updateData,
      include: {
        ...INCLUDE_WORKFLOWS,
        source_datasets: true,
        derived_datasets: true,
      },
    });
  });
}

/** Appends a state entry to a dataset. */
async function addState(dataset_row_id, state, metadata) {
  return prisma.dataset_state.create({
    data: _.omitBy(_.isNil)({ state, dataset_id: dataset_row_id, metadata }),
  });
}

/**
 * Soft-deletes a dataset.
 * If archived (archive_path is set) starts a delete-archive workflow;
 * otherwise marks is_deleted = true directly.
 * Always writes an audit log entry.
 */
async function softDelete(dataset_row_id, user_id) {
  // Deleting removes the archived files and cannot be undone, so a dataset already deleted is a
  // conflict rather than a second delete.
  const dataset = await prisma.$transaction(async (tx) => {
    const locked = await lockDataset(tx, dataset_row_id, INCLUDE_WORKFLOWS);
    assertPossible('delete', locked);
    return locked;
  });

  if (dataset.archive_path) {
    await createWorkflowForDataset({ dataset, wf_name: 'delete', initiator_id: user_id });
  } else {
    await prisma.dataset.update({
      where: { id: dataset_row_id },
      data: {
        is_deleted: true,
        states: { create: { state: 'DELETED' } },
      },
    });
  }

  await prisma.dataset_audit.create({
    data: { action: 'delete', user_id, dataset_id: dataset_row_id },
  });
}

/**
 * Fetches source datasets (datasets this dataset was derived from).
 * Returns paginated results with optional filtering.
 * @param {number} dataset_row_id - the dataset's integer primary key
 * @param {Object} options - Pagination and filtering options
 * @returns {Promise<Object>} { data: Dataset[], metadata: { total, offset, limit } }
 */
async function getSourceDatasets(dataset_row_id, options = {}) {
  const {
    limit = 50,
    offset = 0,
  } = options;

  const [data, total] = await Promise.all([
    prisma.dataset.findMany({
      where: {
        derived_datasets: {
          some: {
            derived_id: dataset_row_id,
          },
        },
      },
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.dataset.count({
      where: {
        derived_datasets: {
          some: {
            derived_id: dataset_row_id,
          },
        },
      },
    }),
  ]);

  return {
    data,
    metadata: { total, offset, limit },
  };
}

/**
 * Fetches derived datasets (datasets derived from this dataset).
 * Returns paginated results with optional filtering.
 * @param {number} dataset_row_id - the dataset's integer primary key
 * @param {Object} options - Pagination and filtering options
 * @returns {Promise<Object>} { data: Dataset[], metadata: { total, offset, limit } }
 */
async function getDerivedDatasets(dataset_row_id, options = {}) {
  const {
    limit = 50,
    offset = 0,
  } = options;

  const [data, total] = await Promise.all([
    prisma.dataset.findMany({
      where: {
        source_datasets: {
          some: {
            source_id: dataset_row_id,
          },
        },
      },
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.dataset.count({
      where: {
        source_datasets: {
          some: {
            source_id: dataset_row_id,
          },
        },
      },
    }),
  ]);

  return {
    data,
    metadata: { total, offset, limit },
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStats,
  patchDataset,
  addState,
  softDelete,
  getSourceDatasets,
  getDerivedDatasets,
  ...fetchModule,
  ...createModule,
  ...useConditionsModule,
  ...attributionModule,
  ...ownershipModule,
};
