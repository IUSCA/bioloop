/**
 * src/routes/notifications.js
 *
 * REST + SSE endpoints for in-app notifications.
 *
 * GET  /notifications/stream       — SSE stream; browser subscribes once and stays connected
 * GET  /notifications              — paginated list (newest first)
 * GET  /notifications/unread-count — { count: number }
 * PATCH /notifications/:id/read    — mark one notification as read
 * PATCH /notifications/read-all    — mark all notifications as read
 */

const express = require('express');
const { query } = require('express-validator');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const InAppNotificationService = require('@/notification/inApp/InAppNotificationService');
const { sseManager } = require('@/notification/inApp/sseManager');

const isPermittedTo = accessControl('notifications');
const router = express.Router();

// ── SSE stream — browser connects once and stays open ──────────────────────
router.get(
  '/stream',
  isPermittedTo('read'),
  (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Open SSE stream for real-time notification push
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx proxy buffering
    });
    res.flushHeaders();

    sseManager.addConnection(req.user.id, res);
  },
);

// ── Paginated notification list ─────────────────────────────────────────────
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('page').default(1).isInt({ min: 1 }).toInt(),
    query('limit').default(20).isInt({ min: 1, max: 100 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get paginated notifications for the current user
    const { page, limit } = req.query;
    const result = await InAppNotificationService.getForUser(req.user.id, { page, limit });
    res.json(result);
  }),
);

// ── Unread count ────────────────────────────────────────────────────────────
router.get(
  '/unread-count',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get unread notification count for the current user
    const count = await InAppNotificationService.getUnreadCount(req.user.id);
    res.json({ count });
  }),
);

// ── Mark all read ───────────────────────────────────────────────────────────
// Must be registered before /:id/read to prevent 'read-all' matching as an id
router.patch(
  '/read-all',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Mark all notifications as read for the current user
    await InAppNotificationService.markAllRead(req.user.id);
    res.json({ success: true });
  }),
);

// ── Mark one read ───────────────────────────────────────────────────────────
router.patch(
  '/:id/read',
  isPermittedTo('update'),
  validate([
    query('id').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Mark a single notification as read
    const { count } = await InAppNotificationService.markRead(req.params.id, req.user.id);
    if (count === 0) {
      throw createError.NotFound('Notification not found');
    }
    res.json({ success: true });
  }),
);

// ── Delete one notification ─────────────────────────────────────────────────
router.delete(
  '/:id',
  isPermittedTo('delete'),
  validate([
    query('id').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Delete a notification (owner only)
    const { count } = await InAppNotificationService.delete(req.params.id, req.user.id);
    if (count === 0) {
      throw createError.NotFound('Notification not found');
    }
    res.json({ success: true });
  }),
);

module.exports = router;
