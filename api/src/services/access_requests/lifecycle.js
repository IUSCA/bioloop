const { ACCESS_REQUEST_STATUS } = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');
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
      include: {
        resource: { include: { dataset: true, collection: true } },
        subject: { include: { user: true, group: true } },
      },
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

    // Use AuditBuilder
    const builder = new AuditBuilder(tx, { actor_id: requester_id });
    await builder
      .setTarget('ACCESS_REQUEST', request_id)
      .setSubject(currentRequest.subject_id)
      .setResource(currentRequest.resource_id);

    builder.mergeMetadata({
      from_status: currentRequest.status,
      to_status: ACCESS_REQUEST_STATUS.WITHDRAWN,
    });

    await builder.create(tx, AUTH_EVENT_TYPE.REQUEST_WITHDRAWN);

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
    const expiredRequests = await tx.access_request.findMany({
      where: {
        status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
        submitted_at: {
          lte: cutoffDate,
        },
      },
      select: {
        id: true,
        subject_id: true,
        resource_id: true,
      },
    });

    // Update all stale requests to EXPIRED
    const updatedRequests = await tx.access_request.updateMany({
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
    });

    // Use AuditBuilder batch creation
    const builder = new AuditBuilder(tx, { actor_id: null, actor_name: 'system' });

    const items = expiredRequests.map((request) => ({
      subject_id: request.subject_id,
      resource_id: request.resource_id,
      metadata: {
        from_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
        to_status: ACCESS_REQUEST_STATUS.EXPIRED,
        max_age_days,
      },
    }));

    await builder.createBatch(tx, AUTH_EVENT_TYPE.REQUEST_EXPIRED, items);

    return updatedRequests.count;
  });
}

module.exports = {
  withdrawRequest,
  expireStaleRequests,
};
