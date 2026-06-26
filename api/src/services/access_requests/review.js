const {
  Prisma, ACCESS_REQUEST_ITEM_DECISION, ACCESS_REQUEST_STATUS,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');
const { setsEqual } = require('@/utils');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');

const { _getRequestById } = require('./fetch');
const grants = require('../grants');

function determineFinalStatus(approvedCount, rejectedCount) {
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
    eventType = AUTH_EVENT_TYPE.REQUEST_PARTIALLY_APPROVED;
  } else {
    // No decisions made (shouldn't happen with validation above)
    finalStatus = ACCESS_REQUEST_STATUS.REJECTED;
    eventType = AUTH_EVENT_TYPE.REQUEST_REJECTED;
  }
  return { finalStatus, eventType };
}

function validateReviewItems(requestItems, reviewItems) {
  // Validate all item IDs belong to this request
  const requestItemIds = new Set(requestItems.map((item) => item.id));
  const decisionItemIds = new Set(reviewItems.map((d) => d.id));
  if (!setsEqual(requestItemIds, decisionItemIds)) {
    throw createError.Conflict(
      'Review decisions must be provided for all request items and cannot include items not in the request',
    );
  }
}

function updateRequestItem(tx, reviewItem) {
  const approved_until = reviewItem.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED
    ? reviewItem.approved_expiry?.toValue()
    : null;

  return tx.access_request_item.update({
    where: { id: reviewItem.id },
    data: {
      approved_until,
      decision: reviewItem.decision,
    },
  });
}

function evaluateReviewDecisions(requestItems, itemDecisions) {
  // Count approvals and rejections, and collect approved items
  let approvedCount = 0;
  let rejectedCount = 0;
  const approvedItems = [];

  const itemDecisionMap = new Map(itemDecisions.map((d) => [d.id, d]));
  for (const item of requestItems) {
    const decisionItem = itemDecisionMap.get(item.id);
    if (decisionItem.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED) {
      approvedCount += 1;
      approvedItems.push({
        id: item.id,
        decision: decisionItem.decision,
        approved_expiry: decisionItem.approved_expiry,
        access_type_id: item.access_type_id,
        preset_id: item.preset_id,
      });
    } else if (decisionItem.decision === ACCESS_REQUEST_ITEM_DECISION.REJECTED) {
      rejectedCount += 1;
    }
  }

  // Determine final request status based on item decisions
  const { finalStatus, eventType } = determineFinalStatus(approvedCount, rejectedCount);
  return {
    approvedItems,
    finalStatus,
    auditEventType: eventType,
    approvedCount,
    rejectedCount,
  };
}

class Review {
  constructor({ request_id, reviewer_id, options = {} }) {
    this.requestId = request_id;
    this.reviewerId = reviewer_id;
    this.itemDecisions = options.item_decisions;
    this.decisionReason = options.decision_reason;
    this._validate();
  }

  _validate() {
    if (!this.requestId) {
      throw createError.BadRequest('request_id is required');
    }
    if (!this.reviewerId) {
      throw createError.BadRequest('reviewer_id is required');
    }
    if (!Array.isArray(this.itemDecisions) || this.itemDecisions.length === 0) {
      throw createError.BadRequest('item_decisions must be a non-empty array');
    }
    // validate each item decision has required fields: id, decision, approved_expiry (if approved)
    for (const itemDecision of this.itemDecisions) {
      if (!itemDecision.id) {
        throw createError.BadRequest('Each item decision must include id');
      }
      if (!Object.values(ACCESS_REQUEST_ITEM_DECISION).includes(itemDecision.decision)) {
        throw createError.BadRequest(`Invalid decision value for item ${itemDecision.id}`);
      }
      if (itemDecision.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED) {
        if (!itemDecision.approved_expiry) {
          throw createError.BadRequest(`approved_expiry is required for APPROVED decisions on item ${itemDecision.id}`);
        }
        if (itemDecision.approved_expiry.hasExpired()) {
          throw createError.BadRequest(`approved_expiry has already expired for item ${itemDecision.id}`);
        }
      }
    }
  }

  async createRequestAuditRecord(tx, {
    finalStatus, auditEventType, approvedCount, rejectedCount,
  }) {
    const builder = new AuditBuilder(tx, { actor_id: this.reviewerId });
    await builder
      .setTarget('ACCESS_REQUEST', this.requestId)
      .setSubject(this.request.subject_id)
      .setResource(this.request.resource_id);

    builder.mergeMetadata({
      from_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
      to_status: finalStatus,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
    });

    return builder.create(tx, auditEventType);
  }

  async submit() {
    this.request = await _getRequestById(prisma, this.requestId);
    if (!this.request) {
      throw createError.NotFound('Access request not found');
    }

    this.reviewerName = await resolveEntityName(prisma, 'user', this.reviewerId);
    this.subjectName = this.request.subject.user?.name || this.request.subject.group?.name || 'Unknown Subject';
    this.resourceOwnerGroupId = this.request.resource?.dataset?.owner_group_id
      || this.request.resource?.collection?.owner_group_id;

    validateReviewItems(this.request.access_request_items, this.itemDecisions);

    const {
      approvedItems,
      finalStatus,
      auditEventType,
      approvedCount,
      rejectedCount,
    } = evaluateReviewDecisions(this.request.access_request_items, this.itemDecisions);

    return prisma.$transaction(async (tx) => {
      // Update request with review outcome first to ensure request is locked for concurrent modifications (e.g.
      // another reviewer trying to review or requester trying to withdraw)
      const updated = await tx.access_request.updateMany({
        where: {
          id: this.requestId,
          status: ACCESS_REQUEST_STATUS.UNDER_REVIEW, // Ensure request is still under review to prevent race conditions
        },
        data: {
          status: finalStatus,
          reviewed_by: this.reviewerId,
          reviewed_at: new Date(),
          closed_at: new Date(),
          decision_reason: this.decisionReason ?? Prisma.skip,
        },
      });
      if (updated.count !== 1) {
        throw createError.Conflict('Request is no longer under review');
      }

      // Create grants for all approved items at once (presets are expanded and deduplicated)
      if (approvedItems.length > 0) {
        const params = {
          subject_id: this.request.subject_id,
          resource_id: this.request.resource_id,
          granted_by: this.reviewerId,
          access_request_id: this.requestId,
        };
        const items = approvedItems.map((item) => ({
          access_type_id: item.access_type_id,
          preset_id: item.preset_id,
          approved_expiry: item.approved_expiry,
        }));
        await grants.issueGrants(tx, params, items);
      }

      // Update all request items with their decisions
      for (const itemDecision of this.itemDecisions) {
        // eslint-disable-next-line no-await-in-loop
        await updateRequestItem(tx, itemDecision);
      }

      // Create a single audit record for the overall review action
      await this.createRequestAuditRecord(tx, {
        finalStatus, auditEventType, approvedCount, rejectedCount,
      });

      return _getRequestById(tx, this.requestId);
    });
  }
}

/**
 * Submit a review for an access request
 * @param {Object} reviewData - Data for the review
 * @param {string} reviewData.request_id - ID of the access request being reviewed
 * @param {number} reviewData.reviewer_id - ID of the user submitting the review
 * @param {Array<Object>} reviewData.options.item_decisions - Array of decisions for each request item: { id, decision, approved_expiry }
 *   Each decision object should have:
 *   - id: Request item ID
 *   - decision: ACCESS_REQUEST_ITEM_DECISION enum value (APPROVED or REJECTED)
 *   - approved_expiry: Expiry class instance (required if decision is APPROVED, optional otherwise)
 * @param {string} [reviewData.options.decision_reason] - Optional reason for the decisions (e.g. if rejected)
 * @returns {Promise<Object>} Updated access request after review is processed
 */
function submitReview(reviewData) {
  const review = new Review(reviewData);
  return review.submit();
}

module.exports = {
  submitReview,
};
