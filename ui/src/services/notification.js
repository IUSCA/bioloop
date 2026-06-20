import config from "@/config";
import api from "@/services/api";

class NotificationService {
  /**
   * Fetch a paginated list of notifications (newest first).
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.limit=20]
   * @returns {Promise<{ notifications: object[], total: number, page: number, limit: number }>}
   */
  getPage({ page = 1, limit = 20 } = {}) {
    return api.get("/notifications", { params: { page, limit } });
  }

  /**
   * Returns the count of unread notifications for the current user.
   * @returns {Promise<{ count: number }>}
   */
  getUnreadCount() {
    return api.get("/notifications/unread-count");
  }

  /**
   * Mark a single notification as read.
   * @param {string} id
   */
  markRead(id) {
    return api.patch(`/notifications/${id}/read`);
  }

  /**
   * Mark all of the current user's notifications as read.
   */
  markAllRead() {
    return api.patch("/notifications/read-all");
  }

  /**
   * Delete a single notification (admin/operator only).
   * @param {string} id
   */
  deleteNotification(id) {
    return api.delete(`/notifications/${id}`);
  }

  /**
   * Open a persistent SSE stream for the current user.
   * Authentication is handled via the session cookie.
   * @returns {EventSource}
   */
  openStream() {
    return new EventSource(`${config.apiBasePath}/notifications/stream`);
  }
}

export default new NotificationService();
