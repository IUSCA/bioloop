const _ = require('lodash/fp');
const { Prisma, RESOURCE_TYPE } = require('@prisma/client');

const CONSTANTS = require('@/constants');
const logger = require('@/services/logger');
const grantService = require('@/services/grants');
const prisma = require('@/db');

function normalize_name(name) {
  return (name || '')
    .replaceAll(/[\W]/g, '-')
    .replaceAll(/-+/g, '-');
}

// ── Query builders ───────────────────────────────────────────────────────────

/**
 * Turns a request body into a Prisma dataset create query.
 *
 * Requires an owning group: v2 refuses to create a dataset no group governs rather than
 * falling back to the seeded quarantine group. The column has a database default naming
 * that group, which is what keeps the legacy creation paths working; v2 never reaches it.
 * @see docs/design/groups/dataset-storage.md — What group scoping changed
 */
const buildDatasetCreateQuery = (data) => {
  const {
    workflow_id, user_id, src_instrument_id, src_dataset_id, state, create_method,
    use_conditions, recorded_by,
  } = data;

  if (!data.owner_group_id) {
    throw new Error('owner_group_id is required to create a dataset');
  }

  const create_query = _.flow([
    _.pick([
      'name', 'type', 'origin_path', 'du_size', 'size',
      'bundle_size', 'metadata', 'description',
    ]),
    _.omitBy(_.isNil),
  ])(data);

  create_query.name = normalize_name(create_query.name);

  // Nesting the resource create below puts Prisma in relation form, so the owning group
  // connects rather than being set as a scalar foreign key.
  create_query.owner_group = { connect: { id: data.owner_group_id } };

  if (workflow_id) {
    create_query.workflows = { create: [{ id: workflow_id }] };
  }

  if (src_instrument_id) {
    create_query.src_instrument = { connect: { id: src_instrument_id } };
  }

  if (src_dataset_id) {
    create_query.source_datasets = { create: [{ source_id: src_dataset_id }] };
  }

  // Every dataset needs a resource row to be grantable, and dataset.resource_id is NOT NULL
  // with no database default. Nesting the create keeps the two in one statement.
  create_query.resource = {
    create: { type: RESOURCE_TYPE.DATASET },
  };

  create_query.states = {
    create: [{ state: state || 'REGISTERED' }],
  };

  // Conditions the donors consented to, as recorded at registration. Captured only;
  // nothing reads them for an authorization decision.
  // @see docs/design/groups/decisions.md — 9. Consent codes are captured, not enforced
  if (use_conditions?.length) {
    create_query.use_conditions = {
      create: use_conditions.map(({
        system, code, label, note,
      }) => ({
        system,
        code,
        label: label ?? null,
        note: note ?? null,
        recorded_by: recorded_by ?? null,
      })),
    };
  }

  // create_method is a column on dataset. dataset_audit has no such field.
  create_query.create_method = create_method || CONSTANTS.DATASET_CREATE_METHODS.SCAN;

  create_query.audit_logs = {
    create: [{
      action: 'create',
      user_id: user_id ?? Prisma.skip,
    }],
  };

  return create_query;
};

// ── Dataset CRUD ─────────────────────────────────────────────────────────────

/**
 * Creates a dataset and seeds its owning group's grant. Idempotent — returns null if the
 * owning group already holds a non-deleted dataset of the same name and type, rather than
 * throwing.
 *
 * @param {object} options
 * @param {object} [options.tx] - run inside this transaction; one is opened when omitted
 * @param {object} options.data - a query from buildDatasetCreateQuery
 * @param {string} [options.actor_id] - subject_id of whoever asked; svc_tasks stands in when null
 */
async function createDataset({ tx = null, data, actor_id = null }) {
  // The dataset and its owning group's grant land together, so a dataset is never briefly
  // reachable by nobody.
  // @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
  const run = async (client) => {
    // Scoped to the owning group, matching the unique key. A global check would report a
    // conflict for a name another group holds, which both blocks a legitimate create and
    // tells the caller that the other group holds it.
    // @see docs/design/groups/dataset-storage.md — What group scoping changed
    const owner_group_id = data.owner_group_id ?? data.owner_group?.connect?.id;
    const existing = await client.dataset.findFirst({
      where: {
        name: data.name, type: data.type, is_deleted: false, owner_group_id,
      },
      select: { id: true },
    });
    if (existing) return null;

    const created = await client.dataset.create({ data });

    await grantService.seedOwningGroupGrant(client, {
      resource_id: created.resource_id,
      resource_type: RESOURCE_TYPE.DATASET,
      owner_group_id: created.owner_group_id,
      actor_id,
    });

    return created;
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Bulk-creates datasets. Returns { created, conflicted, errored }.
 *
 * @param {object[]} datasets - request bodies, each needing an owner_group_id
 * @param {number} [user_id] - user.id recorded on the create audit log
 * @param {string} [actor_id] - subject_id credited with the seeded grants
 */
async function bulkCreateDatasets(datasets, user_id, actor_id = null) {
  const queries = datasets.map((d) => buildDatasetCreateQuery({ ...d, user_id }));

  const results = await Promise.allSettled(
    queries.map((data) => createDataset({ data, actor_id })),
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
  normalize_name,
  buildDatasetCreateQuery,
  createDataset,
  bulkCreateDatasets,
  createAssociations,
};
