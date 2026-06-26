const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');

const CONSTANTS = require('@/constants');
const logger = require('@/services/logger');
const prisma = require('@/db');

function normalize_name(name) {
  return (name || '')
    .replaceAll(/[\W]/g, '-')
    .replaceAll(/-+/g, '-');
}

// ── Query builders ───────────────────────────────────────────────────────────

const buildDatasetCreateQuery = (data) => {
  const {
    workflow_id, user_id, src_instrument_id, src_dataset_id, state, create_method,
  } = data;

  const create_query = _.flow([
    _.pick([
      'name', 'type', 'origin_path', 'du_size', 'size',
      'bundle_size', 'metadata', 'description', 'owner_group_id',
    ]),
    _.omitBy(_.isNil),
  ])(data);

  create_query.name = normalize_name(create_query.name);

  if (workflow_id) {
    create_query.workflows = { create: [{ id: workflow_id }] };
  }

  if (src_instrument_id) {
    create_query.src_instrument = { connect: { id: src_instrument_id } };
  }

  if (src_dataset_id) {
    create_query.source_datasets = { create: [{ source_id: src_dataset_id }] };
  }

  create_query.states = {
    create: [{ state: state || 'REGISTERED' }],
  };

  create_query.audit_logs = {
    create: [{
      action: 'create',
      create_method: create_method || CONSTANTS.DATASET_CREATE_METHODS.SCAN,
      user_id: user_id ?? Prisma.skip,
    }],
  };

  return create_query;
};

// ── Dataset CRUD ─────────────────────────────────────────────────────────────

/**
 * Creates a dataset. Idempotent — returns null if a non-deleted dataset with
 * the same name+type already exists rather than throwing.
 */
async function createDataset({ tx = prisma, data }) {
  const existing = await tx.dataset.findFirst({
    where: { name: data.name, type: data.type, is_deleted: false },
    select: { id: true },
  });
  if (existing) return null;

  return tx.dataset.create({ data });
}

/**
 * Bulk-creates datasets. Returns { created, conflicted, errored }.
 */
async function bulkCreateDatasets(datasets, requester_id) {
  const queries = datasets.map((d) => buildDatasetCreateQuery({ ...d, user_id: requester_id }));

  const results = await Promise.allSettled(
    queries.map((data) => createDataset({ data })),
  );

  const created = [];
  const conflicted = [];
  const errored = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value) created.push(result.value);
      else conflicted.push(_.pick(['name', 'type'])(queries[index]));
    } else if (
      result.reason instanceof Prisma.PrismaClientKnownRequestError
      && result.reason?.code === 'P2002'
    ) {
      conflicted.push(_.pick(['name', 'type'])(queries[index]));
    } else {
      logger.warn(`Error in bulkCreateDatasets: ${JSON.stringify({ dataset: queries[index], error: result.reason })}`);
      errored.push(_.pick(['name', 'type'])(queries[index]));
    }
  });

  return { created, conflicted, errored };
}

/** Bulk-inserts dataset hierarchy (parent→child) associations. */
async function createAssociations(pairs) {
  return prisma.dataset_hierarchy.createMany({ data: pairs });
}

module.exports = {
  createDataset,
  bulkCreateDatasets,
  createAssociations,
};
