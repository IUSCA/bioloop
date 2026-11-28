const express = require('express');
const {
  query, body, param,
} = require('express-validator');
const createError = require('http-errors');

const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const { resolveEligibleRecipients } = require('@/services/notifications/recipientService');
const { fetchCurrentUserNotifications } = require('@/services/notifications/queryService');
const { updateNotificationStateHandler } = require('@/services/notifications/stateUpdateHandler');

const isPermittedTo = accessControl('notifications');
const router = express.Router();

router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnership: true }),
  validate([
    param('username').trim().notEmpty(),
    query('read').optional().isBoolean().toBoolean(),
    query('bookmarked').optional().isBoolean().toBoolean(),
    query('search').optional().trim().isLength({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get current user's notifications
    const notifications = await fetchCurrentUserNotifications({ req });
    return res.json(notifications);
  }),
);

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('read').optional().isBoolean().toBoolean(),
    query('bookmarked').optional().isBoolean().toBoolean(),
    query('search').optional().trim().isLength({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get notifications for current requester
    const notifications = await fetchCurrentUserNotifications({ req });
    return res.json(notifications);
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').trim().notEmpty(),
    body('text').optional().isString(),
    body('type').optional().isString(),
    body('metadata').optional().isObject(),
    body('role_ids').optional().isArray(),
    body('role_ids.*').optional().isInt().toInt(),
    body('user_ids').optional().isArray(),
    body('user_ids.*').optional().isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Post a notification

    const roleIds = req.body.role_ids || [];
    const userIds = req.body.user_ids || [];
    if (roleIds.length === 0 && userIds.length === 0) {
      return next(createError.BadRequest('A user or user role must be specified as the recipient of the notification'));
    }

    const createdNotification = await prisma.$transaction(async (tx) => {
      const recipientRows = await resolveEligibleRecipients({
        tx,
        roleIds,
        userIds,
      });
      if (recipientRows.length === 0) {
        throw createError.BadRequest('No eligible recipients found for notifications feature');
      }

      return tx.notification.create({
        data: {
          type: req.body.type,
          label: req.body.label,
          text: req.body.text,
          metadata: req.body.metadata,
          created_by_id: req.user.id,
          recipients: {
            createMany: {
              data: recipientRows,
            },
          },
        },
      });
    });

    res.json(createdNotification);
  }),
);

router.post(
  '/:id/recipients',
  isPermittedTo('create'),
  validate([
    param('id').isInt().toInt(),
    body('role_ids').optional().isArray(),
    body('role_ids.*').optional().isInt().toInt(),
    body('user_ids').optional().isArray(),
    body('user_ids.*').optional().isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Add recipients to an existing notification
    const roleIds = req.body.role_ids || [];
    const userIds = req.body.user_ids || [];
    if (roleIds.length === 0 && userIds.length === 0) {
      return next(createError.BadRequest('A user or user role must be specified as the recipient of the notification'));
    }

    const result = await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!notification) throw createError.NotFound('Notification not found');

      const candidateRecipients = await resolveEligibleRecipients({
        tx,
        roleIds,
        userIds,
      });
      if (candidateRecipients.length === 0) {
        throw createError.BadRequest('No eligible recipients found for notifications feature');
      }

      const existingRecipients = await tx.notification_recipient.findMany({
        where: {
          notification_id: req.params.id,
          user_id: {
            in: candidateRecipients.map((row) => row.user_id),
          },
        },
        select: {
          user_id: true,
        },
      });
      const existingUserIds = new Set(existingRecipients.map((row) => row.user_id));
      const recipientRowsToCreate = candidateRecipients
        .filter((row) => !existingUserIds.has(row.user_id))
        .map((row) => ({
          ...row,
          notification_id: req.params.id,
        }));

      if (recipientRowsToCreate.length === 0) {
        return {
          conflict: false,
          created_count: 0,
        };
      }

      await tx.notification_recipient.createMany({
        data: recipientRowsToCreate,
      });
      return {
        conflict: false,
        created_count: recipientRowsToCreate.length,
      };
    });

    return res.json(result);
  }),
);

router.patch(
  '/:username/mark-all-read',
  isPermittedTo('update', { checkOwnership: true }),
  validate([
    param('username').trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Mark all current user's notifications as read
    const now = new Date();
    const updated = await prisma.notification_recipient.updateMany({
      where: {
        user_id: req.user.id,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: now,
      },
    });

    return res.json({
      updated_count: updated.count,
    });
  }),
);

router.patch(
  '/mark-all-read',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Mark all requester's notifications as read
    const now = new Date();
    const updated = await prisma.notification_recipient.updateMany({
      where: {
        user_id: req.user.id,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: now,
      },
    });

    return res.json({
      updated_count: updated.count,
    });
  }),
);

router.patch(
  '/:username/:id/state',
  isPermittedTo('update', { checkOwnership: true }),
  validate([
    param('username').trim().notEmpty(),
    param('id').isInt().toInt(),
    body('is_read').optional().isBoolean().toBoolean(),
    body('is_bookmarked').optional().isBoolean().toBoolean(),
  ]),
  updateNotificationStateHandler,
);

router.patch(
  '/:id/state',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('is_read').optional().isBoolean().toBoolean(),
    body('is_bookmarked').optional().isBoolean().toBoolean(),
  ]),
  updateNotificationStateHandler,
);

module.exports = router;
