const {
  Prisma, ACCESS_REQUEST_ITEM_DECISION, ACCESS_REQUEST_STATUS, GRANT_CREATION_TYPE, GRANT_REVOCATION_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');
const { setsEqual } = require('@/utils');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const audit = require('@/authorization/builtin/audit');
const { getPrismaGrantValidityFilter, GRANT_OVERLAP_ERROR_MSG } = require('@/services/grants');

const { _getRequestById } = require('./fetch');

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

// Helper function to select the later of two dates, treating undefined as "sooner than any date" and null as "later than any date"
function selectLaterDate(date1, date2) {
  // undefined means not specified, which is "sooner" than any specific date, so return the other date if one is undefined
  if (date1 === undefined) return date2;
  if (date2 === undefined) return date1;

  // null means no expiration, which is "later" than any specific date, so if one is null, return null
  if (date1 === null || date2 === null) return null;

  // Both dates are defined and not null, return the later one
  return date1 > date2 ? date1 : date2;
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

// Build a map of preset_id -> [access_type_id, ...] for quick lookup when processing approved items
async function buildPresetIdToAccessTypeIdsMap(tx, presetIds) {
  const presets = await tx.grant_preset.findMany({
    where: { id: { in: presetIds } },
    include: { access_type_items: true },
  });
  return new Map(presets.map((p) => [p.id, p.access_type_items.map((i) => i.access_type_id)]));
}

async function fetchExistingGrants(tx, { subject_id, resource_id, accessTypeIds }) {
  const where = getPrismaGrantValidityFilter(true);
  where.subject_id = subject_id;
  where.resource_id = resource_id;
  where.access_type_id = { in: accessTypeIds };

  const existingGrants = await tx.grant.findMany({
    where,
  });

  // Build a map of access_type_id -> existing active grant (if any)
  const existingGrantMap = new Map();
  for (const grant of existingGrants) {
    existingGrantMap.set(grant.access_type_id, grant);
  }
  return existingGrantMap;
}

function updateRequestItem(tx, reviewItem) {
  const approved_until = reviewItem.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED
    ? reviewItem.approved_until
    : null;
  return tx.access_request_item.update({
    where: { id: reviewItem.id },
    data: {
      approved_until,
      decision: reviewItem.decision,
    },
  });
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
  }

  // Build a map: access_type_id -> latest approved_until date from any item providing it
  async _buildAccessTypeIdToApprovedUntilMap(tx) {
    const accessTypeExpirations = new Map();

    const presetIds = this.approvedItems.filter((i) => i.preset_id).map((i) => i.preset_id);
    const presetIdAccessTypeIdsMap = await buildPresetIdToAccessTypeIdsMap(tx, presetIds);

    for (const item of this.approvedItems) {
      let itemAccessTypeIds = []; // access types provided by this item, either directly or via preset

      if (item.access_type_id) {
        itemAccessTypeIds = [item.access_type_id];
      } else if (item.preset_id) {
        itemAccessTypeIds = presetIdAccessTypeIdsMap.get(item.preset_id) || [];
      }

      // Record or update expiration for each access type
      for (const accessTypeId of itemAccessTypeIds) {
        const existing = accessTypeExpirations.get(accessTypeId);
        const newExpiration = item.approved_until;

        // Use the later (more distant) expiration date
        accessTypeExpirations.set(accessTypeId, selectLaterDate(existing, newExpiration));
      }
    }

    return accessTypeExpirations;
  }

  async _createNewGrant(tx, { valid_from, valid_until, access_type_id }) {
    // const data = {
    //   subject_id: this.request.subject_id,
    //   resource_id: this.request.resource_id,
    //   access_type_id,
    //   valid_from,
    //   valid_until,
    //   creation_type: GRANT_CREATION_TYPE.ACCESS_REQUEST_APPROVAL,
    //   source_access_request_id: this.requestId,
    // };
    // const granted_by = this.reviewerId;
    // return createGrant(data, granted_by, tx);

    let grant;
    try {
      grant = await tx.grant.create({
        data: {
          subject_id: this.request.subject_id,
          resource_id: this.request.resource_id,
          access_type_id,
          valid_from: valid_from ?? Prisma.skip,
          valid_until: valid_until ?? Prisma.skip,
          granted_by: this.reviewerId,
          creation_type: GRANT_CREATION_TYPE.ACCESS_REQUEST,
          issuing_authority_id: this.resourceOwnerGroupId,
          source_access_request_id: this.requestId,
        },
      });
    } catch (e) {
      if (e.message.includes('grant_no_overlap')) {
        throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
      }
      throw e;
    }

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_CREATED,
        actor_id: this.reviewerId,
        actor_name: this.reviewerName,
        target_type: audit.TARGET_TYPE.GRANT,
        target_id: grant.id,
      },
    });
  }

  async _createAuditRecordForSkippedGrant(tx, existingGrant) {
    // The audit record notes that no grant was created because an existing grant with a later expiry already covers this access type,
    // referencing the existing grant ID.
    return tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_CREATION_SKIPPED,
        actor_id: this.reviewerId,
        subject_id: this.request.subject_id,
        subject_type: this.request.subject.type,
        target_type: audit.TARGET_TYPE.ACCESS_REQUEST,
        target_id: this.requestId,
        metadata: {
          reason: 'Existing active grant with later expiration already covers this access type',
          existing_grant_id: existingGrant.id,
          access_type_id: existingGrant.access_type_id,
          existing_grant_valid_until: existingGrant.valid_until,
        },
      },
    });
  }

  async _supersedeGrant(tx, { existingGrant, valid_from, valid_until }) {
    // Revoke the existing grant with revocation_type = SUPERSEDED
    await tx.grant.update({
      where: { id: existingGrant.id },
      data: {
        revoked_at: new Date(),
        revocation_type: GRANT_REVOCATION_TYPE.SUPERSEDED,
        revoking_authority_id: this.resourceOwnerGroupId,
      },
    });

    // Create a new grant

    let grant;
    try {
      grant = await tx.grant.create({
        data: {
          subject_id: this.request.subject_id,
          resource_id: this.request.resource_id,
          access_type_id: existingGrant.access_type_id,
          creation_type: GRANT_CREATION_TYPE.ACCESS_REQUEST,
          valid_from: valid_from ?? Prisma.skip,
          valid_until: valid_until ?? Prisma.skip,
          granted_by: this.reviewerId,
          issuing_authority_id: this.resourceOwnerGroupId ?? Prisma.skip,
          source_access_request_id: this.requestId,
        },
      });
    } catch (e) {
      if (e.message.includes('grant_no_overlap')) {
        throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
      }
      throw e;
    }

    // Create an audit record for the superseding action, referencing the existing grant ID and the new grant ID
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_SUPERSEDED,
        actor_id: this.reviewerId,
        actor_name: this.reviewerName,
        target_type: audit.TARGET_TYPE.GRANT,
        target_id: grant.id,
        metadata: {
          reason: 'Existing active grant with earlier expiration superseded by new grant with later expiration',
          existing_grant_id: existingGrant.id,
          access_type_id: existingGrant.access_type_id,
          existing_grant_valid_until: existingGrant.valid_until,
          new_grant_valid_until: grant.valid_until,
        },
      },
    });
  }

  async _createGrantsForApprovedItems(tx) {
    // Build a map: access_type_id -> latest approved_until date from any item providing it
    const accessTypeExpirations = await this._buildAccessTypeIdToApprovedUntilMap(tx);

    // access_type_id -> existing active grant (if any) for the same subject/resource/ access type
    const existingGrantMap = await fetchExistingGrants(tx, {
      subject_id: this.request.subject_id,
      resource_id: this.request.resource_id,
      accessTypeIds: Array.from(accessTypeExpirations.keys()),
    });

    const now = new Date(); // use the same timestamp for all grants created in this batch for consistency
    for (const [accessTypeId, validUntil] of accessTypeExpirations.entries()) {
      const existingGrant = existingGrantMap.get(accessTypeId);

      // case-1: no existing grant - create a new one
      // case-2: existing grant with later valid_until than the approved_until - keep the existing grant
      // case-3: existing grant with earlier valid_until than the approved_until - supersede the existing grant

      // superseding means revoking the existing grant with revocation_type = SUPERSEDED
      // and creating a new grant with valid_from = now and valid_until = approved_until (if any)

      if (!existingGrant) {
        await this._createNewGrant(tx, { valid_from: now, valid_until: validUntil, access_type_id: accessTypeId });
      } else {
        const laterDate = selectLaterDate(existingGrant.valid_until, validUntil);
        if (laterDate === existingGrant.valid_until) {
          // existing grant is still valid for at least as long or longer than the new approved_until so keep it and skip creating a new grant
          await this._createAuditRecordForSkippedGrant(tx, existingGrant);
        } else {
          // supersede the existing grant and create a new one with the later expiration
          await this._supersedeGrant(tx, {
            existingGrant,
            valid_from: now,
            valid_until: validUntil,
          });
        }
      }
    }
  }

  async _createRequestAuditRecord(tx, {
    finalStatus, eventType, approvedCount, rejectedCount,
  }) {
    return tx.authorization_audit.create({
      data: {
        event_type: eventType,
        actor_id: this.reviewerId,
        actor_name: this.reviewerName,
        subject_id: this.request.subject_id,
        subject_name: this.subjectName,
        subject_type: this.request.subject.type,
        target_type: audit.TARGET_TYPE.ACCESS_REQUEST,
        target_id: this.requestId,
        metadata: {
          from_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
          to_status: finalStatus,
          approved_count: approvedCount,
          rejected_count: rejectedCount,
        },
      },
    });
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

    // Count approvals and rejections, and collect approved items
    let approvedCount = 0;
    let rejectedCount = 0;
    this.approvedItems = [];

    const itemDecisionMap = new Map(this.itemDecisions.map((d) => [d.id, d]));
    for (const item of this.request.access_request_items) {
      const decision = itemDecisionMap.get(item.id);
      if (decision.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED) {
        approvedCount += 1;
        this.approvedItems.push({
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
    const { finalStatus, eventType } = determineFinalStatus(approvedCount, rejectedCount);

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
      if (this.approvedItems.length > 0) {
        await this._createGrantsForApprovedItems(tx);
      }

      // Update all request items with their decisions
      for (const itemDecision of this.itemDecisions) {
        // eslint-disable-next-line no-await-in-loop
        await updateRequestItem(tx, itemDecision);
      }

      // Create a single audit record for the overall review action
      await this._createRequestAuditRecord(tx, {
        finalStatus, eventType, approvedCount, rejectedCount,
      });

      return _getRequestById(tx, this.requestId);
    });
  }
}

function submitReview(reviewData) {
  const review = new Review(reviewData);
  return review.submit();
}

module.exports = {
  submitReview,
};
