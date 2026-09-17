const {
  Prisma, ACCESS_REQUEST_STATUS,
} = require('@prisma/client');

const prisma = require('@/db');
const { enumToSql, buildWhereClause } = require('@/utils/sql');
const { accessPathsQuery } = require('@/authorization');
const { withGrantCounts, getAccessSummaryForRequest } = require('./access_summary');

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
      // The owning group is the governance context a reviewer reads the request in, so the
      // detail page names it beside the resource.
      dataset: { include: { owner_group: true } },
      // `_count.datasets` feeds the "Collection · N datasets" line on the request card and the
      // review dialog. It is a public attribute, so every caller who may see the request may see it.
      collection: { include: { owner_group: true, _count: { select: { datasets: true } } } },
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

/**
 * One request, with the summary of what its approval actually produced.
 *
 * `_getRequestById` stays free of the summary, because the transactional callers use it to
 * return the row they have just written and a derived count is not part of that.
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 */
async function getRequestById(request_id) {
  const request = await _getRequestById(prisma, request_id);
  if (!request) return request;
  return { ...request, access_summary: await getAccessSummaryForRequest(request) };
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
  const rows = await prisma.access_request.findMany({
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
    data: await withGrantCounts(rows),
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
  // Reviewable is the admin path on the resource, read from the path statement the review
  // action's own rule compiles to, not written here a second time.
  // @see docs/design/groups/access-model.md — The rule is a query
  const reviewable = Prisma.sql`ar.resource_id IN (
    SELECT p.resource_id FROM (${accessPathsQuery({ userId: reviewer_id, resourceType: 'dataset' })}) p
    WHERE p.path_kind = 'admin'
    UNION
    SELECT p.resource_id FROM (${accessPathsQuery({ userId: reviewer_id, resourceType: 'collection' })}) p
    WHERE p.path_kind = 'admin'
  )`;
  const typeFilter = resource_type
    ? Prisma.sql`EXISTS (SELECT 1 FROM resource r WHERE r.id = ar.resource_id AND r.type = ${enumToSql(resource_type)})`
    : Prisma.empty;
  const whereClause = buildWhereClause([statusFilter, reviewable, resourceFilter, typeFilter], 'AND');

  const dataSql = Prisma.sql`
    SELECT ar.*
    FROM access_request ar
    ${whereClause}
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    OFFSET ${offset}
    LIMIT ${limit}
  `;

  const countSql = Prisma.sql`
    SELECT COUNT(*) AS total_count
    FROM access_request ar
    ${whereClause}
  `;

  const [result, countResult] = await Promise.all([prisma.$queryRaw(dataSql), prisma.$queryRaw(countSql)]);
  const total = Number(countResult[0].total_count);
  const requestIds = result.map((row) => row.id);

  const rows = await prisma.access_request.findMany({
    where: { id: { in: requestIds } },
    include: INCLUDES_CONFIG,
  });
  return { metadata: { total, offset, limit }, data: await withGrantCounts(rows) };
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
  const rows = await prisma.access_request.findMany({
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
    data: await withGrantCounts(rows),
  };
}

module.exports = {
  _getRequestById,
  getRequestById,
  getRequestsReviewedByUser,
  getRequestsPendingReviewForUser,
  getRequestsByUser,
};
