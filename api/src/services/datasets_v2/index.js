const assert = require('assert');
// const path = require('node:path');
const { Prisma, GROUP_MEMBER_ROLE } = require('@prisma/client');

const config = require('config');
const _ = require('lodash/fp');
const prisma = require('@/db');
const wfService = require('@/services/workflow');
const userService = require('@/services/user');
const logger = require('@/services/logger');
const { log_axios_error } = require('@/utils');
const {
  DONE_STATUSES, INCLUDE_WORKFLOWS, INCLUDE_AUDIT_LOGS, INCLUDE_PROJECTS,
} = require('@/constants');
const CONSTANTS = require('@/constants');
const grantService = require('@/services/grants');
const { userHydrator } = require('@/authorization/builtin/hydrators/user');

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize_name(name) {
  return (name || '')
    .replaceAll(/[\W]/g, '-')
    .replaceAll(/-+/g, '-');
}

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

const getBundleName = (dataset) => `${dataset.name}.${dataset.type}.tar`;

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

const buildDatasetsFetchQuery = ({
  deleted, archived, staged, type, name,
  days_since_last_staged, has_workflows, has_derived_data, has_source_data,
  created_at_start, created_at_end, updated_at_start, updated_at_end,
  match_name_exact, id, username,
}) => {
  const query = _.omitBy(_.isUndefined)({
    is_deleted: deleted,
    is_staged: staged,
    type,
    name: name ? {
      ...(match_name_exact ? { equals: name } : { contains: name }),
      mode: 'insensitive',
    } : undefined,
  });

  if (!_.isNil(has_workflows)) {
    query.workflows = { [has_workflows ? 'some' : 'none']: {} };
  }
  if (!_.isNil(has_derived_data)) {
    query.derived_datasets = { [has_derived_data ? 'some' : 'none']: {} };
  }
  if (!_.isNil(has_source_data)) {
    query.source_datasets = { [has_source_data ? 'some' : 'none']: {} };
  }
  if (!_.isNil(archived)) {
    query.archive_path = archived ? { not: null } : null;
  }
  if (_.isNumber(days_since_last_staged)) {
    const xDaysAgo = new Date();
    xDaysAgo.setDate(xDaysAgo.getDate() - days_since_last_staged);
    query.is_staged = true;
    query.NOT = {
      states: { some: { state: 'STAGED', timestamp: { gte: xDaysAgo } } },
    };
  }
  if (created_at_start && created_at_end) {
    query.created_at = {
      gte: new Date(created_at_start),
      lte: new Date(created_at_end),
    };
  }
  if (updated_at_start && updated_at_end) {
    query.updated_at = {
      gte: new Date(updated_at_start),
      lte: new Date(updated_at_end),
    };
  }
  if (id) {
    query.id = Array.isArray(id) ? { in: id } : id;
  }
  if (username) {
    query.projects = {
      some: { project: { users: { some: { user: { username } } } } },
    };
  }

  return query;
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

/**
 * Fetches a single dataset with optional relations.
 * Merges live workflow data from the workflow service when `workflows` is true.
 */
async function getDataset({
  id,
  files = false,
  workflows = false,
  last_task_run = false,
  prev_task_runs = false,
  only_active = false,
  bundle = false,
  include_projects = false,
  initiator = false,
  include_source_instrument = false,
}) {
  const fileSelect = files ? {
    select: { path: true, md5: true },
    where: { NOT: { filetype: 'directory' } },
  } : false;

  const workflow_include = initiator
    ? { workflows: { select: { id: true, initiator: true } } }
    : INCLUDE_WORKFLOWS;

  const dataset = await prisma.dataset.findFirstOrThrow({
    where: { id },
    include: {
      files: fileSelect,
      ...workflow_include,
      ...INCLUDE_AUDIT_LOGS,
      bundle,
      source_datasets: true,
      derived_datasets: true,
      projects: include_projects,
      ...(include_source_instrument ? { src_instrument: { select: { name: true } } } : undefined),
    },
  });

  if (workflows && dataset.workflows.length > 0) {
    const dataset_workflows = dataset.workflows;
    try {
      const wf_res = await wfService.getAll({
        only_active,
        last_task_run,
        prev_task_runs,
        workflow_ids: dataset_workflows.map((x) => x.id),
      });
      dataset.workflows = wf_res.data.results.map((wf) => ({
        ...wf,
        ...dataset_workflows.find((dw) => dw.id === wf.id),
      }));
    } catch (error) {
      log_axios_error(error);
      dataset.workflows = [];
    }
  }

  dataset?.audit_logs?.forEach((log) => {
    // eslint-disable-next-line no-param-reassign
    if (log.user) log.user = userService.transformUser(log.user);
  });

  return dataset;
}

/**
 * Lists datasets with pagination, sorting, and optional relation includes.
 * Returns { metadata: { count }, datasets }.
 */
async function getDatasets({
  sort_by = 'updated_at',
  sort_order = 'desc',
  offset,
  limit,
  bundle,
  include_states,
  include_audit_logs,
  include_projects,
  ...filterParams
}) {
  const where = buildDatasetsFetchQuery(filterParams);
  const filterQuery = { where };

  const optional_sort_columns = ['du_size', 'size', 'bundle_size'];
  const orderBy = optional_sort_columns.includes(sort_by)
    ? { [sort_by]: { nulls: 'last', sort: sort_order } }
    : { [sort_by]: sort_order };

  const retrievalQuery = {
    skip: offset ?? Prisma.skip,
    take: limit ?? Prisma.skip,
    ...filterQuery,
    orderBy,
    include: {
      ...INCLUDE_WORKFLOWS,
      source_datasets: true,
      derived_datasets: true,
      bundle: bundle || false,
      states: include_states || false,
      ...(include_audit_logs ? INCLUDE_AUDIT_LOGS : {}),
      ...(include_projects ? INCLUDE_PROJECTS : {}),
    },
  };

  const [datasets, count] = await prisma.$transaction([
    prisma.dataset.findMany(retrievalQuery),
    prisma.dataset.count(filterQuery),
  ]);

  return { metadata: { count }, datasets };
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

/** Bulk-inserts dataset hierarchy (parent→child) associations. */
async function createAssociations(pairs) {
  return prisma.dataset_hierarchy.createMany({ data: pairs });
}

/**
 * Checks whether a non-deleted dataset with the given type and normalized name
 * already exists.
 */
async function checkNameExists(type, name, deleted = false) {
  const normalizedName = normalize_name(name);
  const match = await prisma.dataset.findUnique({
    where: { name_type_is_deleted: { name: normalizedName, type, is_deleted: deleted } },
  });
  return !!match;
}

async function userHasGrant({ user_id, dataset_id, access_type }) {
  return grantService.userHasGrant({
    user_id,
    resource_type: 'DATASET',
    resource_id: dataset_id,
    access_types: [access_type],
  });
}

async function getDatasetsByOwnerGroup({
  group_id, limit, offset, sort_by, sort_order,
}) {
  const datasets = await prisma.dataset.findMany({
    where: {
      owner_group_id: group_id,
    },
    include: {
      ...INCLUDE_WORKFLOWS,
      source_datasets: true,
      derived_datasets: true,
      bundle: false,
      states: false,
      ...INCLUDE_AUDIT_LOGS,
      ...INCLUDE_PROJECTS,
    },
    take: limit,
    skip: offset,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.dataset.count({
    where: {
      owner_group_id: group_id,
    },
  });
  return { metadata: { total, offset, limit }, data: datasets };
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
  normalize_name,
  getBundleName,
  buildDatasetCreateQuery,
  buildDatasetsFetchQuery,
  createDataset,
  bulkCreateDatasets,
  getDataset,
  getDatasets,
  getStats,
  patchDataset,
  addState,
  softDelete,
  createAssociations,
  checkNameExists,
  userHasGrant,
  getDatasetsByOwnerGroup,
  explainDatasetAccess,
};
