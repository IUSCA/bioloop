const {
  ACCESS_REQUEST_STATUS, SUBJECT_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE, TARGET_TYPE } = require('@/authorization/builtin/audit');
const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');
const { _getRequestById } = require('./fetch');

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

module.exports = {
  withdrawRequest,
  expireStaleRequests,
};
