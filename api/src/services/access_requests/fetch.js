const {
  Prisma, ACCESS_REQUEST_STATUS, GROUP_MEMBER_ROLE,
} = require('@prisma/client');

const prisma = require('@/db');
const { enumToSql, buildWhereClause } = require('@/utils/sql');

const INCLUDES_CONFIG = {
  access_request_items: {
    include: {
      access_type: true,
      preset: {
        include: {
          access_type_items: {
            include: {
              access_type: true,
            },
          },
        },
      },
    },
  },
  requester: true,
  reviewer: true,
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
};

async function _getRequestById(tx, request_id) {
  return tx.access_request.findUnique({
    where: { id: request_id },
    include: INCLUDES_CONFIG,
  });
}

async function getRequestById(request_id) {
  return _getRequestById(prisma, request_id);
}

/** * Get access requests for a user (as requester)
 * @param {string} requester_id - UUID of the user creating the request
 * @param {string} [resource_id] - Filter by resource ID
 * @param {string} [resource_type] - Filter by resource type (e.g. 'DATASET' or 'COLLECTION')
 * @param {string} [status] - Filter by request status
 * @param {string} [sort_by] - Field to sort by (e.g. 'created_at')
 * @param {string} [sort_order] - 'asc' or 'desc'
 * @param {number} [offset] - Pagination offset
 * @param {number} [limit] - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsByUser({
  requester_id, status, sort_by, sort_order, offset, limit, resource_id, resource_type,
}) {
  const where = { requester_id };
  if (status) {
    where.status = status;
  }
  if (resource_id) {
    where.resource_id = resource_id;
  }
  if (resource_type) {
    where.resource = {
      type: resource_type,
    };
  }
  const data = await prisma.access_request.findMany({
    where,
    include: INCLUDES_CONFIG,
    orderBy: {
      [sort_by]: sort_order,
    },
    skip: offset,
    take: limit,
  });
  const total = await prisma.access_request.count({ where });
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
 * Get requests pending review for a user (as reviewer)
 * A user can review a request if they are a reviewer for the resource's owning group
 * @param {string} reviewer_id - UUID of the user performing the review
 * @param {string} [resource_id] - Filter by resource ID
 * @param {string} [resource_type] - Filter by resource type (e.g. 'DATASET' or 'COLLECTION')
 * @param {string} sort_by - Field to sort by (e.g. 'submitted_at')
 * @param {string} sort_order - 'asc' or 'desc'
 * @param {number} offset - Pagination offset
 * @param {number} limit - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsPendingReviewForUser({
  reviewer_id, sort_by, sort_order, offset, limit, resource_id, resource_type,
}) {
  const statusFilter = Prisma.sql`ar.status = ${enumToSql(ACCESS_REQUEST_STATUS.UNDER_REVIEW)}`;
  const resourceFilter = resource_id ? Prisma.sql`ar.resource_id = ${resource_id}` : Prisma.empty;
  const typeFilter = resource_type ? Prisma.sql`r.type = ${enumToSql(resource_type)}` : Prisma.empty;
  const whereClause = buildWhereClause([statusFilter, resourceFilter, typeFilter], 'AND');

  const dataSql = Prisma.sql`
    WITH reviewer_admin_groups AS (
      SELECT gu.group_id
      FROM group_user gu
      WHERE gu.user_id = ${reviewer_id}
        AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
    ),
    owned_resources AS (
      SELECT r.id AS resource_id, r.type
      FROM resource r
      JOIN dataset d ON d.resource_id = r.id
      JOIN reviewer_admin_groups rag ON d.owner_group_id = rag.group_id

      UNION

      SELECT r.id AS resource_id, r.type
      FROM resource r
      JOIN collection c ON c.id = r.id
      JOIN reviewer_admin_groups rag ON c.owner_group_id = rag.group_id
    )
    SELECT ar.*
    FROM access_request ar
    JOIN owned_resources r
      ON ar.resource_id = r.resource_id
    ${whereClause}
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    OFFSET ${offset}
    LIMIT ${limit}
  `;

  const countSql = Prisma.sql`
    WITH reviewer_admin_groups AS (
      SELECT gu.group_id
      FROM group_user gu
      WHERE gu.user_id = ${reviewer_id}
        AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
    ),
    owned_resources AS (
      SELECT r.id AS resource_id, r.type
      FROM resource r
      JOIN dataset d ON d.resource_id = r.id
      JOIN reviewer_admin_groups rag ON d.owner_group_id = rag.group_id

      UNION

      SELECT r.id AS resource_id, r.type
      FROM resource r
      JOIN collection c ON c.id = r.id
      JOIN reviewer_admin_groups rag ON c.owner_group_id = rag.group_id
    )
    SELECT COUNT(*) AS total_count
    FROM access_request ar
    JOIN owned_resources r
      ON ar.resource_id = r.resource_id
    ${whereClause}
  `;

  const [result, countResult] = await Promise.all([prisma.$queryRaw(dataSql), prisma.$queryRaw(countSql)]);
  const total = Number(countResult[0].total_count);
  const requestIds = result.map((row) => row.id);

  const data = await prisma.access_request.findMany({
    where: { id: { in: requestIds } },
    include: INCLUDES_CONFIG,
  });
  return { metadata: { total, offset, limit }, data };
}

/**
 * Get requests reviewed by a user (as reviewer)
 * @param {string} user_id - UUID of the user performing the review
 * @param {string} [resource_id] - Filter by resource ID
 * @param {string} [resource_type] - Filter by resource type (e.g. 'DATASET' or 'COLLECTION')
 * @param {string} sort_by - Field to sort by (e.g. 'reviewed_at')
 * @param {string} sort_order - 'asc' or 'desc'
 * @param {number} offset - Pagination offset
 * @param {number} limit - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsReviewedByUser({
  user_id, sort_by, sort_order, offset, limit, resource_id, resource_type,
}) {
  const where = {
    reviewed_by: user_id,
  };
  if (resource_id) {
    where.resource_id = resource_id;
  }
  if (resource_type) {
    where.resource = {
      type: resource_type,
    };
  }
  const data = await prisma.access_request.findMany({
    where,
    include: INCLUDES_CONFIG,
    orderBy: {
      [sort_by]: sort_order,
    },
    skip: offset,
    take: limit,
  });
  const total = await prisma.access_request.count({
    where: {
      reviewed_by: user_id,
    },
  });
  return {
    metadata: {
      total,
      offset,
      limit,
    },
    data,
  };
}

module.exports = {
  _getRequestById,
  getRequestById,
  getRequestsReviewedByUser,
  getRequestsPendingReviewForUser,
  getRequestsByUser,
};
