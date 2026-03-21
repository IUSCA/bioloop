const { publishToUsers } = require('./sse');

/**
 * Broadcasts an SSE invalidation event to the given users so clients refetch notifications.
 *
 * @param {{ userIds?: number[], reason: string, notificationId?: number|null }} opts
 */
function publishNotificationInvalidation({
  userIds = [],
  reason,
  notificationId = null,
}) {
  publishToUsers({
    userIds,
    payload: {
      type: 'INVALIDATE',
      reason,
      notification_id: notificationId,
    },
  });
}

module.exports = {
  publishNotificationInvalidation,
};
