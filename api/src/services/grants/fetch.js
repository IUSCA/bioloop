const {
  Prisma,
  GROUP_MEMBER_ROLE,
} = require('@prisma/client');

const prisma = require('@/db');
const { enumToSql } = require('@/utils/sql');

const GRANT_INCLUDES = {
  resource: {
    include: {
      dataset: true,
      collection: true,
    },
  },
  subject: {
    include: {
      user: true,
      group: true,
    },
  },
  access_type: true,
  grantor: true,
  revoker: true,
};

/**
 * Get a grant by ID
 * @param {string} grant_id - UUID of the grant
 * @returns {Promise<Object>} Grant record or null if not found
 */
async function getGrantById(grant_id) {
  return prisma.grant.findUnique({
    where: { id: grant_id },
    include: GRANT_INCLUDES,
  });
}

function getPrismaGrantValidityFilter(active) {
  const where = {};
  if (active !== undefined && active !== null) {
    if (active === true) {
      where.revoked_at = null;
      where.valid_from = { lte: new Date() };
      where.OR = [
        { valid_until: null },
        { valid_until: { gt: new Date() } },
      ];
    } else if (active === false) {
      where.OR = [
        { revoked_at: { not: null } },
        { valid_from: { gt: new Date() } },
        { valid_until: { lte: new Date() } },
      ];
    }
  }
  return where;
}

/**
 * List grants for a subject (user or group) with optional filtering by active status and pagination/sorting
 * @param {Object} params
 * @param {string} params.subject_id - UUID of the user or group
 * @param {boolean} [params.active] - If true, only return active grants; if false, only return inactive grants; if omitted, return all grants
 * @param {number} [params.offset] - Pagination offset
 * @param {number} [params.limit] - Pagination limit
 * @param {string} [params.sort_by] - Field to sort by (e.g. 'created_at')
 * @param {'asc'|'desc'} [params.sort_order] - Sort order
 * @returns {Promise<Object>} Paginated list of grants matching the criteria
 */
async function listGrantsForSubject({
  subject_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    subject_id,
  };
  Object.assign(where, getPrismaGrantValidityFilter(active));

  const dataPromise = prisma.grant.findMany({
    where,
    include: GRANT_INCLUDES,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const totalPromise = prisma.grant.count({
    where,
  });
  const [data, total] = await Promise.all([dataPromise, totalPromise]);
  return {
    metadata: {
      total,
      offset,
      limit,
    },
    data,
  };
}

/**
 * List grants for a subject grouped by resource_id (no sort; offset/limit on groups)
 * @param {Object} params
 * @param {string} params.subject_id
 */
async function listGrantsForSubjectGrouped({
  subject_id,
}) {
  const sql = Prisma.sql`
    SELECT
      g.resource_id,
      json_agg(json_build_object(
        'id', g.id,
        'access_type_id', g.access_type_id,
        'access_type_name', gat.name,
        'valid_from', g.valid_from,
        'valid_until', g.valid_until,
        'revoked_at', g.revoked_at
      )) AS grants
    FROM valid_grants g
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    WHERE g.subject_id = ${subject_id}
    GROUP BY g.resource_id
    ORDER BY MAX(g.created_at) ASC -- sort groups by most recent grant creation time
  `;

  const rows = await prisma.$queryRaw(sql);

  // hydrate resource details for each grant group
  const resourceIds = rows.map((r) => r.resource_id);
  const resources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    include: {
      dataset: true,
      collection: true,
    },
  });
  const resourcesById = new Map(resources.map((r) => [r.id, r]));

  const grantsGrouped = rows.map((row) => {
    const resource = resourcesById.get(row.resource_id);
    return {
      resource,
      grants: row.grants,
    };
  });
  return grantsGrouped;
}

/**
 * List grants for a resource (dataset or collection) with optional filtering by active status and pagination/sorting
 * @param {Object} params
 * @param {string} params.resource_id - UUID of the dataset or collection
 * @param {boolean} [params.active] - If true, only return active grants; if false, only return inactive grants; if omitted, return all grants
 * @param {number} [params.offset] - Pagination offset
 * @param {number} [params.limit] - Pagination limit
 * @param {string} [params.sort_by] - Field to sort by (e.g. 'created_at')
 * @param {'asc'|'desc'} [params.sort_order] - Sort order
 * @returns {Promise<Object>} Paginated list of grants matching the criteria
 */
async function listGrantsForResource({
  resource_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    resource_id,
  };
  Object.assign(where, getPrismaGrantValidityFilter(active));
  const dataPromise = prisma.grant.findMany({
    where,
    include: GRANT_INCLUDES,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const totalPromise = prisma.grant.count({
    where,
  });
  const [data, total] = await Promise.all([dataPromise, totalPromise]);
  return {
    metadata: {
      total,
      offset,
      limit,
    },
    data,
  };
}

/**
 * List grants for a resource grouped by subject_id (no sort; offset/limit on groups)
 * @param {Object} params
 * @param {string} params.resource_id
 */
async function listGrantsForResourceGrouped({
  resource_id,
}) {
  const sql = Prisma.sql`
    SELECT
      g.subject_id,
      json_agg(json_build_object(
        'id', g.id,
        'access_type_id', g.access_type_id,
        'access_type_name', gat.name,
        'valid_from', g.valid_from,
        'valid_until', g.valid_until,
        'revoked_at', g.revoked_at
      )) AS grants
    FROM valid_grants g
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    WHERE g.resource_id = ${resource_id}
    GROUP BY g.subject_id
    ORDER BY MAX(g.created_at) ASC -- sort groups by most recent grant creation time
  `;

  const rows = await prisma.$queryRaw(sql);

  // hydrate subject details for each grant group
  const subjectIds = rows.map((r) => r.subject_id);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    include: {
      user: true,
      group: true,
    },
  });
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  const grantsGrouped = rows.map((row) => {
    const subject = subjectsById.get(row.subject_id);
    return {
      subject,
      grants: row.grants,
    };
  });
  return grantsGrouped;
}

async function listAccessTypes() {
  return prisma.grant_access_type.findMany({
    orderBy: {
      name: 'asc',
    },
  });
}

/**
 * List all active grant presets with their access types
 * @returns {Promise<Array>} List of active presets with nested access_type_items
 */
async function listPresets() {
  return prisma.grant_preset.findMany({
    where: { is_active: true },
    include: {
      access_type_items: {
        include: {
          access_type: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

async function _hydrateSubjectsAndResources(data) {
  const subjectIds = [...new Set(data.map((row) => row.subject_id))];
  const resourceIds = [...new Set(data.map((row) => row.resource_id))];
  const [subjects, resources] = await Promise.all([
    prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: {
        id: true, type: true, user: true, group: true,
      },
    }),
    prisma.resource.findMany({
      where: { id: { in: resourceIds } },
      select: {
        id: true, type: true, dataset: true, collection: true,
      },
    }),
  ]);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const resourcesById = new Map(resources.map((r) => [r.id, r]));

  const grantsGrouped = data.map((row) => ({
    subject: subjectsById.get(row.subject_id),
    resource: resourcesById.get(row.resource_id),
    grants: row.grants,
  }));
  return grantsGrouped;
}

/**
 * List all grants that are expiring within a certain number of days
 * @param {Object} params
 * @param {number} params.within_days - Number of days until expiration to filter by (e.g. 30 to find grants expiring within the next 30 days)
 * @returns {Promise<Object>} Paginated list of grants expiring within the specified time frame
 */
async function listExpiringGrants({
  within_days,
}) {
  // filters valid grants that are expiring soon
  // groups by subject_id and resource_id, aggregates access types into an array,
  // and sorts by soonest expiring grant in the group
  const sql = Prisma.sql`
    SELECT
      g.subject_id,
      g.resource_id,
      json_agg(
        json_build_object(
          'id', g.id,
          'access_type_id', g.access_type_id,
          'access_type_name', at.name,
          'valid_from', g.valid_from,
          'valid_until', g.valid_until
        )
        ORDER BY g.valid_until ASC
      ) AS grants
    FROM valid_grants g
    JOIN grant_access_type at
      ON at.id = g.access_type_id
    WHERE g.valid_until IS NOT NULL
      AND g.valid_until <= NOW() + (INTERVAL '1 day' * ${within_days})
    GROUP BY g.subject_id, g.resource_id
    ORDER BY MIN(g.valid_until) ASC
  `;

  const data = await prisma.$queryRaw(sql);

  // hydrate subject and resource details for each grant group
  const grantsGrouped = await _hydrateSubjectsAndResources(data);

  return grantsGrouped;
}

/**
 * List all grants that are expiring within a certain number of days on resources that are owned by groups that user is an admin of
 * @param {Object} params
 * @param {string} params.user_id - UUID of the user
 * @param {number} params.within_days - Number of days until expiration to filter by (e.g. 30 to find grants expiring within the next 30 days)
 * @returns {Promise<Object>} Paginated list of grants expiring within the specified time frame
 */
async function listExpiringGrantsForAdmin({
  user_id,
  within_days,
}) {
  const sql = Prisma.sql`
      WITH admin_groups AS (
        SELECT gu.group_id
        FROM group_user gu
        WHERE gu.user_id = ${user_id}
          AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
      ),
      owned_resources AS (
        SELECT d.resource_id AS resource_id
        FROM dataset d
        JOIN admin_groups ag ON d.owner_group_id = ag.group_id

        UNION

        SELECT c.id AS resource_id
        FROM collection c
        JOIN admin_groups ag ON c.owner_group_id = ag.group_id
      )
      SELECT 
        g.subject_id,
        g.resource_id,
        json_agg(
          json_build_object(
            'id', g.id,
            'access_type_id', g.access_type_id,
            'access_type_name', at.name,
            'valid_from', g.valid_from,
            'valid_until', g.valid_until
          )
          ORDER BY g.valid_until ASC
        ) AS grants
      FROM valid_grants g
      JOIN owned_resources r ON g.resource_id = r.resource_id
      JOIN grant_access_type at ON at.id = g.access_type_id
      WHERE g.valid_until IS NOT NULL
        AND g.valid_until <= NOW() + INTERVAL '1 day' * ${within_days}
      GROUP BY g.subject_id, g.resource_id
      ORDER BY MIN(g.valid_until) ASC
    `;

  const data = await prisma.$queryRaw(sql);

  // hydrate subject and resource details for each grant group
  const grantsGrouped = await _hydrateSubjectsAndResources(data);

  return grantsGrouped;
}

async function listMyGrants({
  user_id, is_active, resource_id, expiring_within_days,
}) {
  const where = {
    subject_id: user_id,
  };
  Object.assign(where, getPrismaGrantValidityFilter(is_active));
  if (resource_id) {
    where.resource_id = resource_id;
  }
  if (expiring_within_days != null) {
    where.valid_until = {
      lte: new Date(Date.now() + expiring_within_days * 24 * 60 * 60 * 1000),
    };
  }

  return prisma.grant.findMany({
    where,
    include: {
      resource: {
        include: {
          dataset: true,
          collection: true,
        },
      },
      access_type: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
}

module.exports = {
  getGrantById,
  listGrantsForSubject,
  listGrantsForResource,
  listGrantsForSubjectGrouped,
  listGrantsForResourceGrouped,
  listAccessTypes,
  listPresets,
  listExpiringGrants,
  listExpiringGrantsForAdmin,
  getPrismaGrantValidityFilter,
  listMyGrants,
};
