/**
 * Access Request Service
 * Manages approval workflow (not authorization itself)
 */

const { Prisma } = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { createGrant } = require('@/services/grants');
const { setsEqual } = require('@/utils');

const config = {
  states: ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  transitions: [
    {
      from: 'DRAFT', to: 'UNDER_REVIEW', action: 'SUBMIT', roles: ['REQUESTER'],
    },
    {
      from: 'DRAFT', to: 'WITHDRAWN', action: 'WITHDRAW', roles: ['REQUESTER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'APPROVED', action: 'APPROVE', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'PARTIALLY_APPROVED', action: 'PARTIAL_APPROVE', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'REJECTED', action: 'REJECT', roles: ['REVIEWER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'WITHDRAWN', action: 'WITHDRAW', roles: ['REQUESTER'],
    },
    {
      from: 'UNDER_REVIEW', to: 'EXPIRED', action: 'EXPIRE', roles: ['SYSTEM'],
    },
  ],
};

// ============================================================================
// Request Lifecycle
// ============================================================================

// ===============================
// System-level invariants assumed
// ===============================
//
// Code correctness depends on these invariants being globally true:
//
// - Request items are only mutable when status = DRAFT.
// - All state transitions use conditional WHERE status = ...
// - No direct update({ where: { id } }) exists anywhere.
// - Grants are protected by DB uniqueness. No multiple valid grants for same subject/resource/access_type can exist.
// - No code modifies access_request_item.decision outside review transaction.
//
// If any of these are violated elsewhere in the codebase, races reappear.

async function _getRequestById(tx, request_id) {
  return tx.access_request.findUnique({
    where: { id: request_id },
    include: {
      access_request_items: {
        include: {
          access_type: true,
        },
      },
      requester: true,
      reviewer: true,
      dataset_resource: true,
      collection_resource: true,
    },
  });
}

async function getRequestById(request_id) {
  return _getRequestById(prisma, request_id);
}

/**
 * Create a new access request
 * @param {Object} data
 * @param {string} data.type - 'NEW' or 'RENEWAL'
 * @param {number} data.resource_id - UUID of the resource
 * @param {string} [data.purpose] - Justification for the request
 * @param {Array<{access_type_id: number, requested_until?: Date}>} data.items - Access types being requested, must be unique within the request
 * @param {string[]} [data.previous_grant_ids] - For renewals, reference to expired grants
 * @param {string} requester_id - UUID of the user creating the request
 * @param {Object} [options]
 * @param {boolean} [options.submit=false] - If true, immediately submit the request for review
 * @returns {Promise<Object>} Created access request
 */
async function createAccessRequest(data, requester_id) {
  return prisma.$transaction(async (tx) => {
    // Create the access request
    const accessRequest = await tx.access_request.create({
      data: {
        type: data.type,
        resource_id: data.resource_id,
        requester_id,
        purpose: data.purpose ?? Prisma.skip,
        previous_grant_ids: data.previous_grant_ids ?? Prisma.skip,
        status: 'DRAFT',
      },
    });

    // Create access request items
    if (data.items && data.items.length > 0) {
      await tx.access_request_item.createMany({
        data: data.items.map((item) => ({
          access_request_id: accessRequest.id,
          access_type_id: item.access_type_id,
          requested_until: item.requested_until ?? Prisma.skip,
          decision: 'PENDING',
        })),
      });
    }

    // Create audit record for request creation
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,
        actor_id: requester_id,
        target_type: 'access_request',
        target_id: accessRequest.id,
        metadata: {
          status: 'DRAFT',
          resource_type: data.resource_type,
          resource_id: data.resource_id,
        },
      },
    });

    // Fetch the complete request with items
    return tx.access_request.findUnique({
      where: { id: accessRequest.id },
      include: {
        access_request_items: {
          include: {
            access_type: true,
          },
        },
      },
    });
  });
}

/**
 * Update a DRAFT access request
 * @param {string} request_id
 * @param {string} requester_id - UUID of the user creating the request
 * @param {Object} data
 * @param {string} [data.purpose] - Updated justification
 * @param {Array<{access_type_id: number, requested_until?: Date}>} [data.items] - Updated items (replaces existing) must be unique within the request
 * @returns {Promise<Object>} Updated access request
 */
async function updateAccessRequest(request_id, requester_id, data) {
  return prisma.$transaction(async (tx) => {
    // Update request metadata
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: 'DRAFT', // Ensure request is still in DRAFT to prevent race conditions
      },
      data: {
        purpose: data.purpose ?? Prisma.skip,
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request is no longer in DRAFT status');
    }

    // If items are provided, replace existing items
    if (data.items && data.items.length > 0) {
      // Delete existing items
      await tx.access_request_item.deleteMany({
        where: { access_request_id: request_id },
      });

      // Create new items
      await tx.access_request_item.createMany({
        data: data.items.map((item) => ({
          access_request_id: request_id,
          access_type_id: item.access_type_id,
          requested_until: item.requested_until ?? Prisma.skip,
          decision: 'PENDING',
        })),
      });
    }

    // Create audit record
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_UPDATED,
        actor_id: requester_id,
        target_type: 'access_request',
        target_id: request_id,
      },
    });

    // Return updated request with items
    return _getRequestById(tx, request_id);
  });
}

/**
 * Throws if the requester already holds an active (non-revoked, currently valid) direct USER grant
 * for any of the access types in this request.
 * Group-mediated access is intentionally excluded — the user may still want a personal grant.
 * @param {Object} request - access_request with access_request_items included
 */
async function _assertNoActiveGrants(request) {
  const now = new Date();
  const itemAccessTypeIds = request.access_request_items.map((item) => item.access_type_id);

  const conflicting = await prisma.grant.findMany({
    where: {
      subject_id: request.requester_id,
      resource_id: request.resource_id,
      access_type_id: { in: itemAccessTypeIds },
      revoked_at: null,
      valid_from: { lte: now },
      OR: [
        { valid_until: null },
        { valid_until: { gt: now } },
      ],
    },
    select: { access_type_id: true },
  });

  if (conflicting.length > 0) {
    const ids = [...new Set(conflicting.map((g) => g.access_type_id))];
    throw createError.Conflict(
      `Access is already granted for access_type_id(s): ${ids.join(', ')}`,
    );
  }
}

/**
 * Throws if the requester already has another DRAFT or UNDER_REVIEW request for the same
 * resource that overlaps with any of the access types in this request.
 * @param {Object} request - access_request with access_request_items included
 */
async function _assertNoInFlightRequests(request) {
  const itemAccessTypeIds = request.access_request_items.map((item) => item.access_type_id);

  const conflicting = await prisma.access_request.findMany({
    where: {
      id: { not: request.id },
      requester_id: request.requester_id,
      resource_id: request.resource_id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
      access_request_items: {
        some: { access_type_id: { in: itemAccessTypeIds } },
      },
    },
    include: {
      // Only include the overlapping items so we can report them
      access_request_items: {
        where: { access_type_id: { in: itemAccessTypeIds } },
        select: { access_type_id: true },
      },
    },
  });

  if (conflicting.length > 0) {
    const conflictingTypeIds = [...new Set(
      conflicting.flatMap((r) => r.access_request_items.map((i) => i.access_type_id)),
    )];
    const requestIds = conflicting.map((r) => r.id);
    throw createError.Conflict(
      `A pending request already exists for access_type_id(s): ${conflictingTypeIds.join(', ')}`
      + ` (request id(s): ${requestIds.join(', ')})`,
    );
  }
}

/**
 * Submit a DRAFT request for review
 * @param {string} request_id
 * @param {string} requester_id - UUID of the user creating the request
 * @returns {Promise<Object>} Updated access request
 */
async function submitRequest(request_id, requester_id) {
  // Fetch the request with items for pre-flight validation
  const request = await _getRequestById(prisma, request_id);
  if (!request || request.status !== 'DRAFT') {
    throw createError.Conflict('Request is no longer in DRAFT status');
  }

  // 1. Reject if the requester already holds active grants for any requested access type
  await _assertNoActiveGrants(request);

  // 2. Reject if another in-flight request covers any of the same access types
  await _assertNoInFlightRequests(request);

  return prisma.$transaction(async (tx) => {
    // Update status to UNDER_REVIEW — WHERE status='DRAFT' guards against concurrent submit races
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: 'DRAFT', // Ensure request is still in DRAFT to prevent race conditions
      },
      data: {
        status: 'UNDER_REVIEW',
        submitted_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request is no longer in DRAFT status');
    }

    // Create audit record
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_SUBMITTED,
        actor_id: requester_id,
        target_type: 'access_request',
        target_id: request_id,
        metadata: {
          from_status: 'DRAFT',
          to_status: 'UNDER_REVIEW',
        },
      },
    });

    return _getRequestById(tx, request_id);
  });
}

function _validateReviewItems(requestItems, reviewItems) {
  // Validate all item IDs belong to this request
  const requestItemIds = new Set(requestItems.map((item) => item.id));
  const decisionItemIds = new Set(reviewItems.map((d) => d.id));
  if (!setsEqual(requestItemIds, decisionItemIds)) {
    throw createError.Conflict(
      'Review decisions must be provided for all request items and cannot include items not in the request',
    );
  }
}

function _determineFinalStatus(approvedCount, rejectedCount) {
  // Determine overall request status based on decisions
  let finalStatus;
  let eventType;
  if (approvedCount > 0 && rejectedCount === 0) {
    finalStatus = 'APPROVED';
    eventType = AUTH_EVENT_TYPE.REQUEST_APPROVED;
  } else if (approvedCount === 0 && rejectedCount > 0) {
    finalStatus = 'REJECTED';
    eventType = AUTH_EVENT_TYPE.REQUEST_REJECTED;
  } else if (approvedCount > 0 && rejectedCount > 0) {
    finalStatus = 'PARTIALLY_APPROVED';
    eventType = AUTH_EVENT_TYPE.REQUEST_APPROVED;
  } else {
    // No decisions made (shouldn't happen with validation above)
    finalStatus = 'REJECTED';
    eventType = AUTH_EVENT_TYPE.REQUEST_REJECTED;
  }
  return { finalStatus, eventType };
}

function _updateRequestItem(tx, reviewItem, { grant_id = null } = {}) {
  return tx.access_request_item.update({
    where: { id: reviewItem.id },
    data: {
      decision: reviewItem.decision,
      created_grant_id: grant_id ?? Prisma.skip,
    },
  });
}

function _createGrant(tx, currentRequest, reviewItem, granted_by) {
  const data = {
    subject_id: currentRequest.requester_id,
    resource_id: currentRequest.resource_id,
    access_type_id: reviewItem.access_type_id,
    valid_until: reviewItem.approved_until,
  };
  return createGrant(data, granted_by, tx);
}

/**
 * Submit a review for an access request
 * Reviewer approves or rejects each request item and submits the review.
 * Approved items will have grants created automatically.
 *
 * Protection against concurrent reviews or withdrawals is implemented - optimistic concurrency control
 *
 * @param {string} request_id
 * @param {string} reviewer_id - UUID of the user performing the review
 * @param {Object} options
 * @param {Array<{id: number, access_type_id: number, decision: 'APPROVED' | 'REJECTED', approved_until?: Date}>} options.review_items - Decision for each item
 * @param {string} [options.decision_reason] - Overall review comment
 * @returns {Promise<Object>} Updated access request with review decisions
 */
async function submitReview({ request_id, reviewer_id, options = {} }) {
  const { review_items: reviewItems, decision_reason } = options;

  // Fetch current request with items
  const currentRequest = await prisma.access_request.findUniqueOrThrow({
    where: { id: request_id },
    include: {
      access_request_items: true,
    },
  });

  // validate decisions match request items
  _validateReviewItems(currentRequest.access_request_items, reviewItems);

  // Count approvals and rejections
  const { approvedCount, rejectedCount } = reviewItems.reduce((acc, curr) => {
    if (curr.decision === 'APPROVED') acc.approvedCount += 1;
    else if (curr.decision === 'REJECTED') acc.rejectedCount += 1;
    return acc;
  }, { approvedCount: 0, rejectedCount: 0 });

  // Determine final request status based on item decisions
  const { finalStatus, eventType } = _determineFinalStatus(approvedCount, rejectedCount);

  return prisma.$transaction(async (tx) => {
    // Update request with review outcome first to ensure request is locked for concurrent modifications (e.g.
    // another reviewer trying to review or requester trying to withdraw)
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: 'UNDER_REVIEW', // Ensure request is still under review to prevent race conditions
      },
      data: {
        status: finalStatus,
        reviewed_by: reviewer_id,
        reviewed_at: new Date(),
        closed_at: new Date(),
        decision_reason: decision_reason ?? Prisma.skip,
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request is no longer under review');
    }

    // fetch updated request items to ensure we have the latest data after locking the request
    const latestRequest = await tx.access_request.findUniqueOrThrow({
      where: { id: request_id },
    });

    // create grants for approved items and update request items with decisions and grant references
    // eslint-disable-next-line no-restricted-syntax
    for (const reviewItem of reviewItems) {
      if (reviewItem.decision === 'APPROVED') {
        // eslint-disable-next-line no-await-in-loop
        const grant = await _createGrant(tx, latestRequest, reviewItem, reviewer_id);
        // eslint-disable-next-line no-await-in-loop
        await _updateRequestItem(tx, reviewItem, { grant_id: grant.id });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await _updateRequestItem(tx, reviewItem);
      }
    }

    // Create audit record for review
    await tx.authorization_audit.create({
      data: {
        event_type: eventType,
        actor_id: reviewer_id,
        target_type: 'access_request',
        target_id: request_id,
        metadata: {
          from_status: 'UNDER_REVIEW',
          to_status: finalStatus,
          approved_count: approvedCount,
          rejected_count: rejectedCount,
        },
      },
    });

    return _getRequestById(tx, request_id);
  });
}

/**
 * Withdraw an access request
 * @param {string} request_id
 * @param {number} requester_id
 * @returns {Promise<Object>} Updated access request
 */
async function withdrawRequest({ request_id, requester_id }) {
  return prisma.$transaction(async (tx) => {
    // Fetch current request
    const currentRequest = await tx.access_request.findUniqueOrThrow({
      where: { id: request_id },
    });

    // Update status to WITHDRAWN
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: {
          in: ['DRAFT', 'UNDER_REVIEW'], // Only allow withdrawal if request is still in DRAFT or UNDER_REVIEW to prevent race conditions with reviews
        },
      },
      data: {
        status: 'WITHDRAWN',
        closed_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request cannot be withdrawn at this stage');
    }

    // Create audit record
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_WITHDRAWN,
        actor_id: requester_id,
        target_type: 'access_request',
        target_id: request_id,
        metadata: {
          from_status: currentRequest.status,
          to_status: 'WITHDRAWN',
        },
      },
    });

    return _getRequestById(tx, request_id);
  });
}

/**
 * Mark requests as expired (batch job for SLA enforcement)
 * Marks UNDER_REVIEW requests older than max_age_days as EXPIRED
 *
 * @param {number} max_age_days - Maximum age in days before expiration
 * @returns {Promise<number>} Count of expired requests
 */
async function expireStaleRequests({ max_age_days }) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - max_age_days);

  return prisma.$transaction(async (tx) => {
    // Find all UNDER_REVIEW requests older than the cutoff date
    // Update all stale requests to EXPIRED
    const updatedRequests = await tx.access_request.updateManyAndReturn({
      where: {
        status: 'UNDER_REVIEW',
        submitted_at: {
          lte: cutoffDate,
        },
      },
      data: {
        status: 'EXPIRED',
        closed_at: new Date(),
      },
      select: {
        id: true,
      },
    });
    const requestIds = updatedRequests.map((r) => r.id);

    // Create audit records for each expired request
    await tx.authorization_audit.createMany({
      data: requestIds.map((request_id) => ({
        event_type: AUTH_EVENT_TYPE.REQUEST_EXPIRED,
        actor_id: null, // System action
        target_type: 'access_request',
        target_id: request_id,
        metadata: {
          from_status: 'UNDER_REVIEW',
          to_status: 'EXPIRED',
          max_age_days,
        },
      })),
    });

    return updatedRequests.length;
  });
}

/** * Get access requests for a user (as requester)
 * @param {string} requester_id - UUID of the user creating the request
 * @param {string} [status] - Filter by request status
 * @param {string} [sort_by] - Field to sort by (e.g. 'created_at')
 * @param {string} [sort_order] - 'asc' or 'desc'
 * @param {number} [offset] - Pagination offset
 * @param {number} [limit] - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsByUser({
  requester_id, status, sort_by, sort_order, offset, limit,
}) {
  const where = { requester_id };
  if (status) {
    where.status = status;
  }
  const data = await prisma.access_request.findMany({
    where,
    include: {
      access_request_items: {
        include: {
          access_type: true,
        },
      },
      dataset_resource: true,
      collection_resource: true,
    },
    orderBy: {
      [sort_by || 'created_at']: sort_order || 'desc',
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
 * @param {string} sort_by - Field to sort by (e.g. 'submitted_at')
 * @param {string} sort_order - 'asc' or 'desc'
 * @param {number} offset - Pagination offset
 * @param {number} limit - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsPendingReviewForUser({
  reviewer_id, sort_by, sort_order, offset, limit,
}) {
  const sql = Prisma.sql`
    WITH results AS (
      WITH reviewer_as_admin_of_groups AS (
        SELECT gu.group_id
        FROM group_user gu
        WHERE gu.user_id = ${reviewer_id}
          AND gu.role = 'ADMIN'
      )
      SELECT *
      FROM access_request ar
      WHERE ar.status = 'UNDER_REVIEW'
        AND ( ar.resource_id IN (
              SELECT d.resource_id
              FROM dataset d
              JOIN reviewer_as_admin_of_groups rag ON d.owner_group_id = rag.group_id
            )
          OR ar.resource_id IN (
              SELECT c.id
              FROM collection c
              JOIN reviewer_as_admin_of_groups rag ON c.owner_group_id = rag.group_id
            )
        )
    )
    SELECT id, count(*) OVER () as total_count
    FROM results
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    OFFSET ${offset}
    LIMIT ${limit}
  `;
  const result = await prisma.$queryRaw(sql);
  const total = Number(result.length > 0 ? result[0].total_count : 0);
  const requestIds = result.map((row) => row.id);

  const data = await prisma.access_request.findMany({
    where: { id: { in: requestIds } },
    include: {
      access_request_items: {
        include: {
          access_type: true,
        },
      },
      requester: true,
      dataset_resource: true,
      collection_resource: true,
    },
  });
  return { metadata: { total, offset, limit }, data };
}

/**
 * Get requests reviewed by a user (as reviewer)
 * @param {string} user_id - UUID of the user performing the review
 * @param {string} sort_by - Field to sort by (e.g. 'reviewed_at')
 * @param {string} sort_order - 'asc' or 'desc'
 * @param {number} offset - Pagination offset
 * @param {number} limit - Pagination limit
 * @returns {Promise<{metadata: {total: number, offset: number, limit: number}, data: Array}>}
 */
async function getRequestsReviewedByUser({
  user_id, sort_by, sort_order, offset, limit,
}) {
  const data = await prisma.access_request.findMany({
    where: {
      reviewed_by: user_id,
    },
    include: {
      access_request_items: {
        include: {
          access_type: true,
        },
      },
      requester: true,
      dataset_resource: true,
      collection_resource: true,
    },
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
  createAccessRequest,
  updateAccessRequest,
  submitRequest,
  submitReview,
  withdrawRequest,
  expireStaleRequests,
  getRequestById,
  getRequestsByUser,
  getRequestsPendingReviewForUser,
  getRequestsReviewedByUser,
  accessRequestStates: config.states,
};
