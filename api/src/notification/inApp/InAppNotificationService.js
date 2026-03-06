/**
 * src/notification/inApp/InAppNotificationService.js
 *
 * Manages in-app notification persistence and real-time delivery.
 * Uses the shared Prisma singleton for DB writes and sseManager for push.
 */

const { Prisma } = require('@prisma/client');
const _ = require('lodash/fp');

const prisma = require('@/db');
const logger = require('@/services/logger');

class InAppNotificationService {
  /**
   * Create a notification record and push it to the user's browser via SSE.
   *
   * @param {object} opts
   * @param {number} opts.userId
   * @param {string} opts.type        - e.g. 'alert' | 'workflow' | 'request' | 'system'
   * @param {string} opts.title
   * @param {string} [opts.body]
   * @param {object} opts.payload   - type-specific data; used by the UI to pick and render
   *                                    the appropriate Vue component
   * @returns {Promise<object>} the created notification row
   */
  // eslint-disable-next-line class-methods-use-this
  async create({
    userId, type, title, payload, body = null,
  }) {
    const notification = await prisma.notification.create({
      data: {
        user_id: userId,
        type,
        title,
        body: body ?? Prisma.skip,
        payload: _.omitBy(_.isUndefined)(payload), // omit null/undefined values to save DB space
      },
    });

    // Push to SSE after DB write — import lazily to avoid circular deps
    try {
      const { sseManager } = require('./sseManager'); // eslint-disable-line global-require
      await sseManager.push(userId, notification);
    } catch (err) {
      logger.warn('[InAppNotificationService] SSE push failed', { userId, error: err.message });
    }

    return notification;
  }

  /**
   * Paginated notification list for a single user, newest first.
   *
   * @param {number} userId
   * @param {object} [opts]
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @returns {Promise<{ notifications: object[], total: number, page: number, limit: number }>}
   */
  // eslint-disable-next-line class-methods-use-this
  async getForUser(userId, { page, limit }) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { user_id: userId } }),
    ]);

    return {
      data: notifications, metadata: { total, page, limit },
    };
  }

  /**
   * Count of unread notifications for a user.
   *
   * @param {number} userId
   * @returns {Promise<number>}
   */
  // eslint-disable-next-line class-methods-use-this
  async getUnreadCount(userId) {
    return prisma.notification.count({
      where: { user_id: userId, is_read: false },
    });
  }

  /**
   * Mark a single notification as read.
   * The userId check prevents users from reading other users' notifications.
   *
   * @param {string} notificationId - cuid
   * @param {number} userId
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line class-methods-use-this
  async markRead(notificationId, userId) {
    return prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });
  }

  /**
   * Mark all notifications for a user as read.
   *
   * @param {number} userId
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line class-methods-use-this
  async markAllRead(userId) {
    return prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }

  /**
   * Delete a single notification (owner only).
   *
   * @param {string} notificationId
   * @param {number} userId
   */
  // eslint-disable-next-line class-methods-use-this
  async delete(notificationId, userId) {
    return prisma.notification.deleteMany({
      where: { id: notificationId, user_id: userId },
    });
  }
}

module.exports = new InAppNotificationService();
