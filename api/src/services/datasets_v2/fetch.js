const _ = require('lodash/fp');
const { Prisma, GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const { enumToSql, buildWhereClause, createLikePattern } = require('@/utils/sql');
const grantService = require('@/services/grants');

/**
 * Create an includes object for Prisma queries based on requested includes.
 * @param {object} includes - An object specifying which related entities to include
 * @param {Boolean} includes.states - Whether to include dataset states
 * @param {Boolean} includes.bundle - Whether to include the associated bundle
 * @param {Boolean} includes.source_instrument - Whether to include the source instrument
 * @param {Boolean} includes.files - Whether to include associated files (excluding directories)
 * @param {Boolean} includes.source_datasets - Whether to include source datasets
 * @param {Boolean} includes.derived_datasets - Whether to include derived datasets
 * @param {Boolean} includes.workflows - Whether to include associated workflows
 * @returns {object} An includes object for Prisma queries
 */
function createPrismaInclude(includes) {
  const result = {};
  if (includes.states) {
    result.states = true;
  }
  if (includes.bundle) {
    result.bundle = true;
  }
  if (includes.source_instrument) {
    result.source_instrument = {
      select: {
        name: true,
      },
    };
  }
  if (includes.files) {
    result.files = {
      select: { path: true, md5: true },
      where: { NOT: { filetype: 'directory' } },
    };
  }
  if (includes.source_datasets) {
    result.source_datasets = true;
  }
  if (includes.derived_datasets) {
    result.derived_datasets = true;
  }
  if (includes.workflows) {
    result.workflows = {
      select: {
        id: true,
        initiator: true,
      },
    };
  }
  return result;
}

/**
 * Create an orderBy object for Prisma queries based on sort_by and sort_order.
 * For certain columns, ensure that null values are sorted last.
 * @param {object} options
 * @param {string} options.sort_by - The column to sort by
 * @param {'asc'|'desc'} options.sort_order - The sort order
 * @returns {object} An orderBy object for Prisma queries
 */
function createPrismaOrderBy({ sort_by, sort_order }) {
  const optional_sort_columns = ['du_size', 'size', 'bundle_size'];
  const orderBy = optional_sort_columns.includes(sort_by)
    ? { [sort_by]: { nulls: 'last', sort: sort_order } }
    : { [sort_by]: sort_order };
  return orderBy;
}

/**
 * Create a filters object for Prisma queries based on provided filter parameters.
 * Only includes filters that are not undefined or null.
 * @param {object} filters
 * @param {boolean} [filters.is_deleted] - true to filter for deleted datasets, false for non-deleted, omit for all
 * @param {boolean} [filters.is_archived] - true to filter for archived datasets, false for non-archived, omit for all
 * @param {boolean} [filters.is_staged] - true to filter for staged datasets, false for non-staged, omit for all
 * @param {boolean} [filters.has_workflows] - true to filter for datasets with workflows, false for datasets without workflows, omit for all
 * @param {boolean} [filters.has_derived_data] - true to filter for datasets with derived data, false for datasets without derived data, omit for all
 * @param {boolean} [filters.has_source_data] - true to filter for datasets with source data, false for datasets without source data, omit for all
 * @param {string} [filters.type] - Filter by dataset type
 * @param {string} [filters.name] - Filter by dataset name (partial match)
 * @returns {object} A filters object for Prisma queries
 */
function createPrismaWhere({
  is_deleted, is_archived, is_staged,
  has_workflows, has_derived_data, has_source_data,
  type, name,
  id, resource_id, owner_group_id, collection_id,
  created_at_start, created_at_end, updated_at_start, updated_at_end, days_since_last_staged,
}) {
  const filters = {};
  if (is_deleted != null) {
    filters.is_deleted = is_deleted;
  }
  if (is_archived != null) {
    filters.archive_path = is_archived ? { not: null } : null;
  }
  if (is_staged != null) {
    filters.is_staged = is_staged;
  }
  if (has_workflows != null) {
    filters.workflows = { [has_workflows ? 'some' : 'none']: {} };
  }
  if (has_derived_data != null) {
    filters.derived_datasets = { [has_derived_data ? 'some' : 'none']: {} };
  }
  if (has_source_data != null) {
    filters.source_datasets = { [has_source_data ? 'some' : 'none']: {} };
  }
  if (type != null) {
    filters.type = type;
  }
  if (name != null) {
    filters.name = { contains: name, mode: 'insensitive' };
  }
  if (id != null) {
    filters.id = id;
  }
  if (resource_id != null) {
    filters.resource_id = resource_id;
  }
  if (owner_group_id != null) {
    filters.owner_group_id = owner_group_id;
  }
  if (collection_id != null) {
    filters.collections = { some: { collection_id } };
  }
  if (created_at_start != null || created_at_end != null) {
    filters.created_at = {};
    if (created_at_start != null) {
      filters.created_at.gte = created_at_start;
    }
    if (created_at_end != null) {
      filters.created_at.lte = created_at_end;
    }
  }
  if (updated_at_start != null || updated_at_end != null) {
    filters.updated_at = {};
    if (updated_at_start != null) {
      filters.updated_at.gte = updated_at_start;
    }
    if (updated_at_end != null) {
      filters.updated_at.lte = updated_at_end;
    }
  }
  if (_.isNumber(days_since_last_staged)) {
    const xDaysAgo = new Date();
    xDaysAgo.setDate(xDaysAgo.getDate() - days_since_last_staged);
    filters.is_staged = true;
    filters.NOT = {
      states: { some: { state: 'STAGED', timestamp: { gte: xDaysAgo } } },
    };
  }
  return filters;
}

function createSqlWhere({
  is_deleted, is_archived, is_staged,
  has_workflows, has_derived_data, has_source_data,
  type, name,
  id, resource_id, owner_group_id, collection_id,
  created_at_start, created_at_end, updated_at_start, updated_at_end, days_since_last_staged,
}) {
  const clauses = [];
  if (is_deleted != null) {
    clauses.push(Prisma.sql`d.is_deleted = ${is_deleted}`);
  }
  if (is_archived != null) {
    clauses.push(is_archived
      ? Prisma.sql`d.archive_path IS NOT NULL`
      : Prisma.sql`d.archive_path IS NULL`);
  }
  if (is_staged != null) {
    clauses.push(Prisma.sql`d.is_staged = ${is_staged}`);
  }
  if (has_workflows != null) {
    clauses.push(has_workflows
      ? Prisma.sql`EXISTS (SELECT 1 FROM dataset_workflow dw WHERE dw.dataset_id = d.id)`
      : Prisma.sql`NOT EXISTS (SELECT 1 FROM dataset_workflow dw WHERE dw.dataset_id = d.id)`);
  }
  if (has_derived_data != null) {
    clauses.push(has_derived_data
      ? Prisma.sql`EXISTS (SELECT 1 FROM dataset_hierarchy dh WHERE dh.source_id = d.id)`
      : Prisma.sql`NOT EXISTS (SELECT 1 FROM dataset_hierarchy dh WHERE dh.source_id = d.id)`);
  }
  if (has_source_data != null) {
    clauses.push(has_source_data
      ? Prisma.sql`EXISTS (SELECT 1 FROM dataset_hierarchy dh WHERE dh.derived_id = d.id)`
      : Prisma.sql`NOT EXISTS (SELECT 1 FROM dataset_hierarchy dh WHERE dh.derived_id = d.id)`);
  }
  if (type != null) {
    clauses.push(Prisma.sql`d.type = ${type}`);
  }
  if (name != null) {
    clauses.push(Prisma.sql`d.name ILIKE ${createLikePattern(name)}`);
  }
  if (id != null) {
    clauses.push(Prisma.sql`d.id = ${id}`);
  }
  if (resource_id != null) {
    clauses.push(Prisma.sql`d.resource_id = ${resource_id}`);
  }
  if (owner_group_id != null) {
    clauses.push(Prisma.sql`d.owner_group_id = ${owner_group_id}`);
  }
  if (collection_id != null) {
    clauses.push(Prisma.sql`
      EXISTS (
        SELECT 1 
        FROM collection_dataset cd 
        WHERE 
          cd.dataset_id = d.resource_id
          AND cd.collection_id = ${collection_id}
      )
    `);
  }
  if (created_at_start != null) {
    clauses.push(Prisma.sql`d.created_at >= ${created_at_start}`);
  }
  if (created_at_end != null) {
    clauses.push(Prisma.sql`d.created_at <= ${created_at_end}`);
  }
  if (updated_at_start != null) {
    clauses.push(Prisma.sql`d.updated_at >= ${updated_at_start}`);
  }
  if (updated_at_end != null) {
    clauses.push(Prisma.sql`d.updated_at <= ${updated_at_end}`);
  }
  if (_.isNumber(days_since_last_staged)) {
    const xDaysAgo = new Date();
    xDaysAgo.setDate(xDaysAgo.getDate() - days_since_last_staged);
    clauses.push(Prisma.sql`
      d.is_staged = true AND
      NOT EXISTS (
        SELECT 1 FROM dataset_state ds
        WHERE ds.dataset_id = d.id AND ds.state = 'STAGED' AND ds.timestamp >= ${xDaysAgo}
      )
    `);
  }
  return buildWhereClause(clauses);
}

function createSqlOrderBy({ sort_by, sort_order }) {
  return Prisma.sql`ORDER BY d.${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)} NULLS LAST`;
}

/**
 * Fetch a dataset by ID, with optional includes.
 * @param {string} resource_id
 * @param {object} options
 * @param {object} options.includes - Related entities to include in the response
 * @returns {Promise<object>} The dataset with requested includes
 */
async function getDatasetById(resource_id, { includes }) {
  return prisma.dataset.findUnique({
    where: { resource_id },
    include: createPrismaInclude(includes),
  });
}

async function searchAllDatasets({
  filters, pagination, sort, includes,
}) {
  const where = createPrismaWhere(filters);
  const orderBy = createPrismaOrderBy(sort);
  const include = createPrismaInclude(includes);

  const [datasets, total_count] = await Promise.all([
    prisma.dataset.findMany({
      where,
      orderBy,
      include,
      skip: pagination.offset ?? Prisma.skip,
      take: pagination.limit ?? Prisma.skip,
    }),
    prisma.dataset.count({ where }),
  ]);

  return { data: datasets, metadata: { total: total_count } };
}

async function searchDatasetsForUser({
  user_id, filters, pagination, sort, includes,
}) {
  // user is an admin of the group that owns the dataset
  // OR user has oversight of the group that owns the dataset
  // OR user has any grant on dataset

  const whereClause = createSqlWhere(filters);
  const orderByClause = createSqlOrderBy(sort);

  const cte_query = Prisma.sql`
    WITH accessible_ids AS (
      -- via grants
      (${grantService.accessibleDatasetIdsByGrantsQuery(user_id)})

      UNION

      -- via group ownership
      SELECT d.resource_id
      FROM "dataset" d
      JOIN group_user gu ON d.owner_group_id = gu.group_id
      WHERE gu.user_id = ${user_id} AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}

      UNION

      -- via group oversight
      SELECT d.resource_id
      FROM "dataset" d
      JOIN effective_user_oversight_groups eug 
        ON eug.user_id = ${user_id} AND d.owner_group_id = eug.group_id
    )
  `;

  const data_query = Prisma.sql`
    ${cte_query}
    SELECT d.*
    FROM "dataset" d
    JOIN accessible_ids ai ON d.resource_id = ai.resource_id
    ${whereClause}
    ${orderByClause}
    OFFSET ${pagination.offset}
    LIMIT ${pagination.limit}
  `;

  const count_query = Prisma.sql`
    ${cte_query}
    SELECT COUNT(*)
    FROM "dataset" d
    JOIN accessible_ids ai ON d.resource_id = ai.resource_id
    ${whereClause}
  `;

  // console.log(data_query.sql, data_query.values);

  const [data_result, count_result] = await Promise.all([
    prisma.$queryRaw(data_query),
    prisma.$queryRaw(count_query),
  ]);

  // run prisma.findMany with ids from data_result to get includes (states, workflows, etc) since those can't be easily fetched via SQL
  const data_with_includes = await prisma.dataset.findMany({
    where: { id: { in: data_result.map((r) => r.id) } },
    include: createPrismaInclude(includes),
  });

  const total_count = Number(count_result[0]?.count || 0);
  return { data: data_with_includes, metadata: { total: total_count } };
}

async function getDatasetsByOwnerGroup(owner_group_id, opts) {
  return searchAllDatasets({
    ...opts,
    filters: {
      ...opts.filters,
      owner_group_id,
    },
  });
}

async function getDatasetsByCollection(collection_id, opts) {
  return searchAllDatasets({
    ...opts,
    filters: {
      ...opts.filters,
      collection_id,
    },
  });
}

module.exports = {
  getDatasetById,
  searchAllDatasets,
  searchDatasetsForUser,
  getDatasetsByOwnerGroup,
  getDatasetsByCollection,
};
