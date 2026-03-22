const _ = require('lodash/fp');
const createError = require('http-errors');
const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { publishNotificationInvalidation } = require('./invalidation');

const updateNotificationStateHandler = asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['notifications']
  // #swagger.summary = Update current user's per-notification state

  const hasStateUpdate = ['is_read', 'is_bookmarked'].some((key) => req.body[key] !== undefined);
  if (!hasStateUpdate) {
    return next(createError.BadRequest('At least one state field must be provided'));
  }

  let readAt;
  if (req.body.is_read === undefined) readAt = undefined;
  else if (req.body.is_read) readAt = new Date();
  else readAt = null;

  let bookmarkedAt;
  if (req.body.is_bookmarked === undefined) bookmarkedAt = undefined;
  else if (req.body.is_bookmarked) bookmarkedAt = new Date();
  else bookmarkedAt = null;

  const data = _.omitBy(_.isUndefined)({
    is_read: req.body.is_read,
    read_at: readAt,
    is_bookmarked: req.body.is_bookmarked,
    bookmarked_at: bookmarkedAt,
  });

  const recipient = await prisma.notification_recipient.findUnique({
    where: {
      notification_id_user_id: {
        notification_id: req.params.id,
        user_id: req.user.id,
      },
    },
    include: {
      notification: {
        select: {
          is_resolved: true,
        },
      },
    },
  });

  if (!recipient) {
    return next(createError.NotFound('Notification not found for current user'));
  }
  if (recipient.notification.is_resolved) {
    return res.status(409).json({
      code: 'NOTIFICATION_WITHDRAWN',
      message: 'Notification is withdrawn and no longer actionable.',
    });
  }

  const updated = await prisma.notification_recipient.update({
    where: {
      notification_id_user_id: {
        notification_id: req.params.id,
        user_id: req.user.id,
      },
    },
    data: {
      ...data,
    },
  });

  publishNotificationInvalidation({
    userIds: [req.user.id],
    reason: 'state_updated',
    notificationId: req.params.id,
  });

  return res.json({
    notification_id: req.params.id,
    user_id: req.user.id,
    state: {
      is_read: updated.is_read,
      is_bookmarked: updated.is_bookmarked,
    },
  });
});

module.exports = {
  updateNotificationStateHandler,
};
