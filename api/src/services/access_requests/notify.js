const { RESOURCE_TYPE, GROUP_MEMBER_ROLE, Prisma } = require('@prisma/client');

const prisma = require('@/db');
const logger = require('@/services/logger');
const inAppNotificationService = require('@/notification/inApp/InAppNotificationService');
const { TYPES } = require('@/notification/types');

/**
 * In-app notification for the two moments in an access request that need one.
 *
 * People do not poll a portal, so an un-notified approval reads as a rejection. Use case 9
 * puts this in the first release.
 *
 * The notification bus is deliberately not used. `EVENTS.REQUEST_RECEIVED` and
 * `EVENTS.REQUEST_COMPLETED` have handlers registered and nothing emits them, so emitting
 * looked like the obvious wiring. But `NotificationService._enqueue` always queues an email
 * job and throws when it has no recipients; in-app is a dual write that happens only when a
 * `userId` comes along too. There is no in-app-only path, and adding one changes shared
 * infrastructure the notifications epic owns. So those two events keep having no emitter and
 * this module writes the row itself.
 *
 * Every function here is best-effort. A notification that cannot be delivered must not undo
 * an approval, so failures are logged and swallowed, and the callers run these after their
 * transaction has committed.
 *
 * @see docs/design/groups/design.md — Notifications and expiry
 */

/**
 * The users who may decide this request: the admins of the resource's owning group.
 *
 * The same set `getRequestsPendingReviewForUser` selects, approached from the other
 * direction — from one resource to its reviewers rather than from one reviewer to their
 * queue.
 *
 * @param {string} resource_id
 * @returns {Promise<Array<{id: number}>>} user rows, by integer id
 */
async function findReviewers(resource_id) {
  return prisma.$queryRaw(Prisma.sql`
    WITH owning_group AS (
      SELECT d.owner_group_id AS group_id FROM dataset d WHERE d.resource_id = ${resource_id}
      UNION
      SELECT c.owner_group_id FROM collection c WHERE c.id = ${resource_id}
    )
    SELECT u.id
    FROM active_group_user gu
    JOIN owning_group og ON og.group_id = gu.group_id
    JOIN "user" u ON u.subject_id = gu.user_id
    WHERE gu.role = ${GROUP_MEMBER_ROLE.ADMIN}::"GROUP_MEMBER_ROLE"
      AND u.is_deleted = false
  `);
}

/** The resource's own name, for a notification title that says what was asked for. */
function resourceName(request) {
  return request.resource?.type === RESOURCE_TYPE.DATASET
    ? request.resource?.dataset?.name
    : request.resource?.collection?.name;
}

function requesterName(request) {
  return request.requester?.name || request.requester?.username || 'Someone';
}

async function send(userId, { title, body, payload }) {
  return inAppNotificationService.create({
    userId, type: TYPES.REQUEST, title, body, payload,
  });
}

/**
 * Tell the reviewers a request is waiting for them.
 *
 * @param {object} request - an access_request with `resource` and `requester` included
 */
async function notifyReviewersOfSubmission(request) {
  try {
    const reviewers = await findReviewers(request.resource_id);
    const name = resourceName(request) ?? 'a resource';

    await Promise.all(reviewers.map((reviewer) => send(reviewer.id, {
      title: `Access request for ${name}`,
      body: request.purpose ?? null,
      payload: {
        requestId: request.id,
        requesterName: requesterName(request),
        actionUrl: `/v2/access-requests/${request.id}`,
        actionLabel: 'Review request',
      },
    })));
  } catch (err) {
    logger.warn('[access-requests] failed to notify reviewers', {
      request_id: request.id, error: err.message,
    });
  }
}

/**
 * Tell the requester what was decided.
 *
 * The requester is notified, not the subject: a group's admin who asked on the group's
 * behalf is the person who needs the answer, and a group has no inbox.
 *
 * @param {object} request - an access_request with `resource` and `requester` included
 */
async function notifyRequesterOfDecision(request) {
  try {
    const requester = await prisma.user.findUnique({
      where: { subject_id: request.requester_id },
      select: { id: true },
    });
    if (!requester) return;

    const name = resourceName(request) ?? 'a resource';
    const decision = request.status.replaceAll('_', ' ').toLowerCase();

    await send(requester.id, {
      title: `Your access request for ${name} was ${decision}`,
      body: request.decision_reason ?? null,
      payload: {
        requestId: request.id,
        requestTitle: name,
        actionUrl: `/v2/access-requests/${request.id}`,
        actionLabel: 'View decision',
      },
    });
  } catch (err) {
    logger.warn('[access-requests] failed to notify requester', {
      request_id: request.id, error: err.message,
    });
  }
}

module.exports = { findReviewers, notifyReviewersOfSubmission, notifyRequesterOfDecision };
