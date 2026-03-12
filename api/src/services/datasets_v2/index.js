const assert = require('assert');
// const path = require('node:path');
const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const config = require('config');
const _ = require('lodash/fp');
const prisma = require('@/db');
const wfService = require('@/services/workflow');

const {
  DONE_STATUSES, INCLUDE_WORKFLOWS,
} = require('@/constants');

const grantService = require('@/services/grants');
const { userHydrator } = require('@/authorization/builtin/hydrators/user');
const fetchModule = require('./fetch');
const createModule = require('./create');

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
 * Partially updates a dataset. Merges metadata and handles bundle upsert.
 */
async function patchDataset(id, data) {
  const current = await prisma.dataset.findFirstOrThrow({ where: { id } });
  const { metadata, bundle, ...rest } = data;

  const updateData = _.omitBy(_.isUndefined)(rest);
  updateData.metadata = _.merge(current.metadata)(metadata);

  if (bundle) {
    updateData.bundle = { upsert: { create: bundle, update: bundle } };
  }

  return prisma.dataset.update({
    where: { id },
    data: updateData,
    include: {
      ...INCLUDE_WORKFLOWS,
      source_datasets: true,
      derived_datasets: true,
    },
  });
}

/** Appends a state entry to a dataset. */
async function addState(dataset_id, state, metadata) {
  return prisma.dataset_state.create({
    data: _.omitBy(_.isNil)({ state, dataset_id, metadata }),
  });
}

/**
 * Soft-deletes a dataset.
 * If archived (archive_path is set) starts a delete-archive workflow;
 * otherwise marks is_deleted = true directly.
 * Always writes an audit log entry.
 */
async function softDelete(dataset_id, user_id) {
  const dataset = await prisma.dataset.findFirstOrThrow({
    where: { id: dataset_id },
    include: INCLUDE_WORKFLOWS,
  });

  if (dataset.archive_path) {
    await createWorkflowForDataset({ dataset, wf_name: 'delete', initiator_id: user_id });
  } else {
    await prisma.dataset.update({
      where: { id: dataset_id },
      data: {
        is_deleted: true,
        states: { create: { state: 'DELETED' } },
      },
    });
  }

  await prisma.dataset_audit.create({
    data: { action: 'delete', user_id, dataset_id },
  });
}

async function userHasGrant({ user_id, dataset_id, access_type }) {
  return grantService.userHasGrant({
    user_id,
    resource_type: 'DATASET',
    resource_id: dataset_id,
    access_types: [access_type],
  });
}

/**
 * Explain why user can/cannot access a dataset
 * Returns all applicable grants and ownership paths
 * @param {number} user_id
 * @param {number} dataset_id
 * @param {string} action
 * @returns {Promise<Object>} Detailed explanation
 */
async function explainDatasetAccess({ user_id, dataset_id, access_types }) {
  // platformAdmin
  // admin of owning group
  // has oversight of owning group
  // grants

  const user = await userHydrator.hydrate({
    id: user_id,
    attributes: ['id', 'roles', 'group_memberships', 'oversight_group_ids', 'effective_group_ids'],
  });

  if (user.roles.includes('admin')) {
    return {
      granted: true,
      reason: 'User is a platform admin',
    };
  }

  const dataset = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset_id } });

  const adminGroupIds = user.group_memberships
    .filter((gm) => gm.role === GROUP_MEMBER_ROLE.ADMIN)
    .map((gm) => gm.group_id);
  if (adminGroupIds.includes(dataset.owner_group_id)) {
    return {
      granted: true,
      reason: 'User is an admin of the owning group',
    };
  }

  if (user.oversight_group_ids.includes(dataset.owner_group_id)) {
    return {
      granted: true,
      reason: 'User has oversight of the owning group',
    };
  }

  const grants = await grantService.getUserDatasetGrants({ user_id, dataset_id, access_types });
  if (grants.length > 0) {
    return {
      granted: true,
      reason: 'User has grants on the dataset',
      grants,
    };
  }

  return {
    granted: false,
    reason: 'User does not have any applicable grants',
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getStats,
  patchDataset,
  addState,
  softDelete,
  userHasGrant,
  explainDatasetAccess,
  ...fetchModule,
  ...createModule,
};
