const { RESOURCE_TYPE } = require('@prisma/client');

const prisma = require('@/db');
const logger = require('@/services/logger');
const inAppNotificationService = require('@/notification/inApp/InAppNotificationService');
const { TYPES } = require('@/notification/types');

/**
 * In-app notice to a person whose access was revoked.
 *
 * Use case 54: a user learns when they lose access without watching the portal. The notice
 * is written the way `access_requests/notify.js` writes its own, straight to the in-app
 * service, because the notification bus always queues an email job.
 *
 * Only a USER subject is told. A group has no inbox, and whether every member of a group
 * should hear about a grant removed from the group is a separate question.
 *
 * Best-effort: callers run this after the revoking transaction has committed, and a failure
 * is logged and swallowed so it never undoes a revocation.
 *
 * @see docs/design/groups/use-cases.md — 4.3 User experience expectations
 * @param {Array<object>} revokedGrants - grant rows sharing one subject and one resource
 */
async function notifySubjectOfRevocation(revokedGrants) {
  if (!revokedGrants?.length) return;
  const { subject_id, resource_id, revocation_reason } = revokedGrants[0];

  try {
    const user = await prisma.user.findUnique({
      where: { subject_id },
      select: { id: true },
    });
    if (!user) return;

    const resource = await prisma.resource.findUnique({
      where: { id: resource_id },
      select: {
        type: true,
        dataset: { select: { name: true } },
        collection: { select: { name: true } },
      },
    });
    const isDataset = resource?.type === RESOURCE_TYPE.DATASET;
    const name = (isDataset ? resource?.dataset?.name : resource?.collection?.name) ?? 'a resource';

    await inAppNotificationService.create({
      userId: user.id,
      type: TYPES.REQUEST,
      title: `Your access to ${name} was revoked`,
      body: revocation_reason ?? null,
      payload: {
        actionUrl: isDataset ? `/v2/datasets/${resource_id}` : `/v2/collections/${resource_id}`,
        actionLabel: 'View',
      },
    });
  } catch (err) {
    logger.warn('[grants] failed to notify subject of revocation', {
      subject_id, resource_id, error: err.message,
    });
  }
}

module.exports = { notifySubjectOfRevocation };
