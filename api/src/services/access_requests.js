/**
 * Access Request Service
 * Manages approval workflow (not authorization itself)
 */

const {
  Prisma, GROUP_MEMBER_ROLE, ACCESS_REQUEST_STATUS, ACCESS_REQUEST_ITEM_DECISION, GRANT_CREATION_TYPE,
  GRANT_REVOCATION_TYPE, SUBJECT_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { resolveEntityName, resolveGrant } = require('@/authorization/builtin/audit/helpers');
const { createGrant } = require('@/services/grants');
const { setsEqual } = require('@/utils');
const { enumToSql, buildWhereClause } = require('@/utils/sql');
const { TARGET_TYPE } = require('@/authorization/builtin/audit');

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
};

/**
 * Expand access_request_items that have preset_id set to their constituent access_type_id values.
 * Direct access_type_id items are included as-is.
 * Returns a deduplicated Set of access_type_id numbers.
 * @param {*} tx - Prisma transaction
 * @param {Array} items - access_request_items with preset_id and/or access_type_id set
 * @returns {Promise<Set<number>>} Unique access_type_ids
 */
async function _expandItemsToAccessTypeIds(tx, items) {
  const accessTypeIds = new Set();

  for (const item of items) {
    if (item.access_type_id) {
      accessTypeIds.add(item.access_type_id);
    } else if (item.preset_id) {
      // Fetch the preset items and add their access type IDs
      const presetItems = await tx.grant_preset_item.findMany({
        where: { preset_id: item.preset_id },
        select: { access_type_id: true },
      });
      presetItems.forEach((pi) => accessTypeIds.add(pi.access_type_id));
    }
  }

  return accessTypeIds;
}

async function _getRequestById(tx, request_id) {
  return tx.access_request.findUnique({
    where: { id: request_id },
    include: INCLUDES_CONFIG,
  });
}

async function getRequestById(request_id) {
  return _getRequestById(prisma, request_id);
}

async function _validateAccessRequestSubject(tx, requester_id, subject_id) {
  const subject = await tx.subject.findUnique({
    where: { id: subject_id },
  });

  if (!subject) {
    throw createError.NotFound('Subject not found');
  }

  // Self-request: subject must exactly match requester subject and must be a USER subject
  if (subject_id === requester_id) {
    if (subject.type !== SUBJECT_TYPE.USER) {
      throw createError.Forbidden('Self access request must target a user subject');
    }
    return;
  }

  // Group request: subject must be a GROUP and requester must be ADMIN of that group
  if (subject.type === SUBJECT_TYPE.GROUP) {
    const isAdmin = await tx.group_user.findFirst({
      where: {
        group_id: subject_id,
        user_id: requester_id,
        role: GROUP_MEMBER_ROLE.ADMIN,
      },
    });

    if (isAdmin) {
      return;
    }

    throw createError.Forbidden('Requester must be an admin of the requested group');
  }

  // All other-user requests are not allowed
  throw createError.Forbidden('Requesting on behalf of another user is not allowed');
}

async function _enrichItemsWithPresetName(tx, items) {
  if (!items || items.length === 0) {
    return items;
  }

  const presetIds = [...new Set(items.filter((it) => it.preset_id != null).map((it) => it.preset_id))];
  if (presetIds.length === 0) {
    return items;
  }

  const presets = await tx.grant_preset.findMany({
    where: { id: { in: presetIds } },
    select: { id: true, name: true },
  });
  const presetNameMap = new Map(presets.map((p) => [p.id, p.name]));

  return items.map((item) => ({
    ...item,
    source_preset_name: item.preset_id ? (presetNameMap.get(item.preset_id) ?? null) : undefined,
  }));
}

/**
 * Create a new access request
 * @param {Object} data
 * @param {string} data.type - 'NEW' or 'RENEWAL'
 * @param {string} data.resource_id - UUID of the resource
 * @param {string} data.subject_id - UUID of the subject (user or group) for whom access is being requested
 * @param {string} [data.purpose] - Justification for the request
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_until?: Date}>} data.items - Access types or presets being requested, must be unique within the request. Each item must have exactly one of access_type_id or preset_id.
 * @param {string[]} [data.previous_grant_ids] - For renewals, reference to expired grants
 * @param {string} requester_id - UUID of the user creating the request
 * @returns {Promise<Object>} Created access request
 */
async function createAccessRequest(data, requester_id) {
  return prisma.$transaction(async (tx) => {
    await _validateAccessRequestSubject(tx, requester_id, data.subject_id);

    // Create the access request
    const accessRequest = await tx.access_request.create({
      data: {
        type: data.type,
        resource_id: data.resource_id,
        requester_id,
        subject_id: data.subject_id,
        purpose: data.purpose ?? Prisma.skip,
        previous_grant_ids: data.previous_grant_ids ?? Prisma.skip,
        status: ACCESS_REQUEST_STATUS.DRAFT,
      },
    });

    // Create access request items (each with either access_type_id or preset_id, never both)
    if (data.items && data.items.length > 0) {
      const enrichedItems = await _enrichItemsWithPresetName(tx, data.items);
      await tx.access_request_item.createMany({
        data: enrichedItems.map((item) => ({
          access_request_id: accessRequest.id,
          access_type_id: item.access_type_id ?? Prisma.skip,
          preset_id: item.preset_id ?? Prisma.skip,
          source_preset_name: item.preset_id ? (item.source_preset_name ?? Prisma.skip) : Prisma.skip,
          requested_until: item.requested_until ?? Prisma.skip,
          decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
        })),
      });
    }

    // Create audit record for request creation
    const requesterName = await resolveEntityName(tx, 'user', requester_id);
    const resource = await tx.resource.findUnique({
      where: { id: data.resource_id },
      select: { dataset: { select: { name: true } }, collection: { select: { name: true } }, type: true },
    });
    const resourceName = resource.dataset?.name ?? resource?.collection?.name;

    // Resolve subject name and type
    const subject = await tx.subject.findUnique({
      where: { id: data.subject_id },
      include: { user: true, group: true },
    });
    const subjectType = subject?.type;
    const subjectName = subjectType === SUBJECT_TYPE.USER ? subject.user?.name : subject.group?.name;

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,
        actor_id: requester_id,
        actor_name: requesterName,
        subject_id: data.subject_id,
        subject_name: subjectName,
        subject_type: subjectType,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: accessRequest.id,
        metadata: {
          resource_id: data.resource_id,
          resource_type: resource?.type,
          resource_name: resourceName,
          status: ACCESS_REQUEST_STATUS.DRAFT,
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
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_until?: Date}>} [data.items] - Updated items (replaces existing). Each item must have exactly one of access_type_id or preset_id.
 * @returns {Promise<Object>} Updated access request
 */
async function updateAccessRequest(request_id, requester_id, data) {
  return prisma.$transaction(async (tx) => {
    // get a row-level lock on the request to prevent concurrent updates
    // Ensure request is still in DRAFT to prevent updates on requests that are already submitted or closed
    const rows = await tx.$queryRaw`
      SELECT id, status
      FROM access_request 
      WHERE 
        id = ${request_id}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw createError.NotFound();
    }
    const { status } = rows[0];
    if (status !== ACCESS_REQUEST_STATUS.DRAFT) {
      throw createError.Conflict('Request is not in DRAFT status');
    }

    if (data.purpose) {
      await tx.access_request.update({
        where: { id: request_id },
        data: { purpose: data.purpose },
      });
    }

    // If items are provided, replace existing items
    if (data.items && data.items.length > 0) {
      // Delete existing items
      await tx.access_request_item.deleteMany({
        where: { access_request_id: request_id },
      });

      // Create new items
      const enrichedItems = await _enrichItemsWithPresetName(tx, data.items);
      await tx.access_request_item.createMany({
        data: enrichedItems.map((item) => ({
          access_request_id: request_id,
          access_type_id: item.access_type_id ?? Prisma.skip,
          preset_id: item.preset_id ?? Prisma.skip,
          source_preset_name: item.preset_id ? (item.source_preset_name ?? Prisma.skip) : Prisma.skip,
          requested_until: item.requested_until ?? Prisma.skip,
          decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
        })),
      });
    }

    // Create audit record
    const requesterName = await resolveEntityName(tx, 'user', requester_id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_UPDATED,
        actor_id: requester_id,
        actor_name: requesterName,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
      },
    });

    // Return updated request with items
    return _getRequestById(tx, request_id);
  });
}

/**
 * Throws if the subject already holds an active (non-revoked, currently valid) grant
 * for any of the access types in this request (including those expanded from presets).
 * Group-mediated access is intentionally excluded — the user may still want a personal grant.
 * @param {Object} request - access_request with access_request_items included
 */
/**
 * Throws if the subject already has another UNDER_REVIEW request for the same
 * resource that overlaps with any of the access types in this request (direct or preset-expanded).
 * @param {Object} request - access_request with access_request_items included
 */
async function _assertNoInFlightRequests(request) {
  const expandedAccessTypeIds = await _expandItemsToAccessTypeIds(prisma, request.access_request_items);

  if (expandedAccessTypeIds.size === 0) {
    // No access types to check
    return;
  }

  const conflicting = await prisma.access_request.findMany({
    where: {
      id: { not: request.id },
      subject_id: request.subject_id,
      resource_id: request.resource_id,
      status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
    },
    include: {
      access_request_items: {
        select: { id: true, access_type_id: true, preset_id: true },
      },
    },
  });

  if (conflicting.length === 0) {
    return;
  }

  // For each conflicting request, expand its items and check for overlap
  const conflictingTypeIds = new Set();
  const conflictingRequestIds = [];

  for (const otherRequest of conflicting) {
    const otherExpandedIds = await _expandItemsToAccessTypeIds(prisma, otherRequest.access_request_items);
    for (const id of otherExpandedIds) {
      if (expandedAccessTypeIds.has(id)) {
        conflictingTypeIds.add(id);
        conflictingRequestIds.push(otherRequest.id);
      }
    }
  }

  if (conflictingTypeIds.size > 0) {
    throw createError.Conflict('One or more pending requests already exist for some of the same access types', {
      details: {
        access_type_ids: Array.from(conflictingTypeIds),
        request_ids: [...new Set(conflictingRequestIds)],
      },
    });
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
  if (!request || request.status !== ACCESS_REQUEST_STATUS.DRAFT) {
    throw createError.Conflict('Request is no longer in DRAFT status');
  }

  // 1. Reject if another in-flight request covers any of the same access types
  await _assertNoInFlightRequests(request);

  return prisma.$transaction(async (tx) => {
    // Update status to UNDER_REVIEW — WHERE status='DRAFT' guards against concurrent submit races
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: ACCESS_REQUEST_STATUS.DRAFT, // Ensure request is still in DRAFT to prevent race conditions
      },
      data: {
        status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
        submitted_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request is no longer in DRAFT status');
    }

    // Create audit record
    const requesterName = await resolveEntityName(tx, 'user', requester_id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_SUBMITTED,
        actor_id: requester_id,
        actor_name: requesterName,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
        metadata: {
          from_status: ACCESS_REQUEST_STATUS.DRAFT,
          to_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
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
    finalStatus = ACCESS_REQUEST_STATUS.APPROVED;
    eventType = AUTH_EVENT_TYPE.REQUEST_APPROVED;
  } else if (approvedCount === 0 && rejectedCount > 0) {
    finalStatus = ACCESS_REQUEST_STATUS.REJECTED;
    eventType = AUTH_EVENT_TYPE.REQUEST_REJECTED;
  } else if (approvedCount > 0 && rejectedCount > 0) {
    finalStatus = ACCESS_REQUEST_STATUS.PARTIALLY_APPROVED;
    eventType = AUTH_EVENT_TYPE.REQUEST_APPROVED;
  } else {
    // No decisions made (shouldn't happen with validation above)
    finalStatus = ACCESS_REQUEST_STATUS.REJECTED;
    eventType = AUTH_EVENT_TYPE.REQUEST_REJECTED;
  }
  return { finalStatus, eventType };
}

function _updateRequestItem(tx, reviewItem) {
  return tx.access_request_item.update({
    where: { id: reviewItem.id },
    data: {
      decision: reviewItem.decision,
    },
  });
}

/**
 * Create grants for all approved items in a request
 * Expands preset items to their constituent access types, deduplicates, and creates one grant per unique access type
 * @param {*} tx - Prisma transaction
 * @param {Object} currentRequest - The access_request being reviewed
 * @param {Array} approvedItems - Items that were approved (each has { id, decision, approved_until, access_type_id?, preset_id? })
 * @param {string} granted_by - UUID of the reviewer
 * @returns {Promise<void>}
 */
async function _createGrantsForApprovedItems(tx, currentRequest, approvedItems, granted_by) {
  // Build a map: access_type_id -> latest approved_until date from any item providing it
  const accessTypeExpirations = new Map();

  for (const item of approvedItems) {
    let itemAccessTypeIds = [];

    if (item.access_type_id) {
      itemAccessTypeIds = [item.access_type_id];
    } else if (item.preset_id) {
      // Fetch preset items
      const presetItems = await tx.grant_preset_item.findMany({
        where: { preset_id: item.preset_id },
        select: { access_type_id: true },
      });
      itemAccessTypeIds = presetItems.map((pi) => pi.access_type_id);
    }

    // Record or update expiration for each access type
    for (const accessTypeId of itemAccessTypeIds) {
      const existing = accessTypeExpirations.get(accessTypeId);
      const newExpiration = item.approved_until;

      // Use the later (more distant) expiration date
      if (!existing || (newExpiration && (!existing || newExpiration > existing))) {
        accessTypeExpirations.set(accessTypeId, newExpiration);
      }
    }
  }

  // Create one grant per unique access type, superseding any existing active grant for the same tuple.
  for (const [accessTypeId, validUntil] of accessTypeExpirations.entries()) {
    const now = new Date();

    const existingGrant = await tx.grant.findFirst({
      where: {
        subject_id: currentRequest.subject_id,
        resource_id: currentRequest.resource_id,
        access_type_id: accessTypeId,
        revoked_at: null,
        valid_from: { lte: now },
        OR: [
          { valid_until: null },
          { valid_until: { gt: now } },
        ],
      },
    });

    const grantData = {
      subject_id: currentRequest.subject_id,
      resource_id: currentRequest.resource_id,
      access_type_id: accessTypeId,
      valid_from: existingGrant ? now : Prisma.skip,
      valid_until: validUntil ?? Prisma.skip,
      creation_type: GRANT_CREATION_TYPE.ACCESS_REQUEST,
      source_access_request_id: currentRequest.id,
    };

    if (existingGrant) {
      await tx.grant.update({
        where: { id: existingGrant.id },
        data: {
          valid_until: now,
          revocation_type: GRANT_REVOCATION_TYPE.SUPERSEDED,
        },
      });

      const actorName = await resolveEntityName(tx, 'user', granted_by);
      const fullGrant = await resolveGrant(tx, existingGrant.id);

      await tx.authorization_audit.create({
        data: {
          event_type: AUTH_EVENT_TYPE.GRANT_SUPERSEDED,
          actor_id: granted_by,
          actor_name: actorName,
          subject_id: fullGrant.subject_id,
          subject_name: fullGrant.subject.name,
          subject_type: fullGrant.subject.type,
          metadata: {
            resource_id: fullGrant.resource_id,
            resource_type: fullGrant.resource.type,
            resource_name: fullGrant.resource.name,
            access_type_name: fullGrant.access_type.name,
            superseded_by_request_id: currentRequest.id,
          },
          target_type: TARGET_TYPE.GRANT,
          target_id: fullGrant.id,
        },
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await createGrant(grantData, granted_by, tx);
  }
}

/**
 * Submit a review for an access request
 * Reviewer approves or rejects each request item and submits the review.
 * Approved items will have grants created automatically.
 *
 * Presets are expanded to grants at this stage, with deduplication at the access_type level.
 * Protection against concurrent reviews or withdrawals is implemented - optimistic concurrency control
 *
 * @param {string} request_id
 * @param {string} reviewer_id - UUID of the user performing the review
 * @param {Object} options
 * @param {Array<{id: string, decision: 'APPROVED' | 'REJECTED', approved_until?: Date}>} options.item_decisions - Decision for each item (identified by UUID)
 * @param {string} [options.decision_reason] - Overall review comment
 * @returns {Promise<Object>} Updated access request with review decisions
 */
async function submitReview({ request_id, reviewer_id, options = {} }) {
  const { item_decisions: itemDecisions, decision_reason } = options;

  // Fetch current request with items
  const currentRequest = await prisma.access_request.findUniqueOrThrow({
    where: { id: request_id },
    include: {
      access_request_items: {
        select: {
          id: true, access_type_id: true, preset_id: true, requested_until: true,
        },
      },
    },
  });

  // validate decisions match request items
  _validateReviewItems(currentRequest.access_request_items, itemDecisions);

  // Count approvals and rejections, and collect approved items
  let approvedCount = 0;
  let rejectedCount = 0;
  const approvedItems = [];

  const itemDecisionMap = new Map(itemDecisions.map((d) => [d.id, d]));

  for (const item of currentRequest.access_request_items) {
    const decision = itemDecisionMap.get(item.id);
    if (decision.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED) {
      approvedCount += 1;
      approvedItems.push({
        id: item.id,
        decision: decision.decision,
        approved_until: decision.approved_until,
        access_type_id: item.access_type_id,
        preset_id: item.preset_id,
      });
    } else if (decision.decision === ACCESS_REQUEST_ITEM_DECISION.REJECTED) {
      rejectedCount += 1;
    }
  }

  // Determine final request status based on item decisions
  const { finalStatus, eventType } = _determineFinalStatus(approvedCount, rejectedCount);

  return prisma.$transaction(async (tx) => {
    // Update request with review outcome first to ensure request is locked for concurrent modifications (e.g.
    // another reviewer trying to review or requester trying to withdraw)
    const updated = await tx.access_request.updateMany({
      where: {
        id: request_id,
        status: ACCESS_REQUEST_STATUS.UNDER_REVIEW, // Ensure request is still under review to prevent race conditions
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

    // fetch updated request for audit
    const latestRequest = await tx.access_request.findUniqueOrThrow({
      where: { id: request_id },
    });

    // Create grants for all approved items at once (presets are expanded and deduplicated)
    if (approvedItems.length > 0) {
      await _createGrantsForApprovedItems(tx, latestRequest, approvedItems, reviewer_id);
    }

    // Update all request items with their decisions
    for (const itemDecision of itemDecisions) {
      // eslint-disable-next-line no-await-in-loop
      await _updateRequestItem(tx, itemDecision);
    }

    // Create audit record for review
    const reviewerName = await resolveEntityName(tx, 'user', reviewer_id);
    const requesterName = await resolveEntityName(tx, 'user', latestRequest.requester_id);

    await tx.authorization_audit.create({
      data: {
        event_type: eventType,
        actor_id: reviewer_id,
        actor_name: reviewerName,
        subject_id: latestRequest.requester_id,
        subject_name: requesterName,
        subject_type: SUBJECT_TYPE.USER,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
        metadata: {
          from_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
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
          in: [ACCESS_REQUEST_STATUS.DRAFT, ACCESS_REQUEST_STATUS.UNDER_REVIEW], // Only allow withdrawal if request is still in DRAFT or UNDER_REVIEW to prevent race conditions with reviews
        },
      },
      data: {
        status: ACCESS_REQUEST_STATUS.WITHDRAWN,
        closed_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw createError.Conflict('Request cannot be withdrawn at this stage');
    }

    // Create audit record
    const requesterName = await resolveEntityName(tx, 'user', requester_id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_WITHDRAWN,
        actor_id: requester_id,
        actor_name: requesterName,
        subject_id: requester_id,
        subject_name: requesterName,
        subject_type: SUBJECT_TYPE.USER,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
        metadata: {
          from_status: currentRequest.status,
          to_status: ACCESS_REQUEST_STATUS.WITHDRAWN,
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
        status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
        submitted_at: {
          lte: cutoffDate,
        },
      },
      data: {
        status: ACCESS_REQUEST_STATUS.EXPIRED,
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
        actor_name: 'system',
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
        metadata: {
          from_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
          to_status: ACCESS_REQUEST_STATUS.EXPIRED,
          max_age_days,
        },
      })),
    });

    return updatedRequests.length;
  });
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
  ACCESS_REQUEST_STATES: config.states,
};
