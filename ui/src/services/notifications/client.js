import api from "@/services/api";

/**
 * HTTP client for the notifications REST API.
 *
 * All methods route through either the ownership-scoped path
 * (`/notifications/:username/...`) when `forSelf` is true (user role),
 * or the general path (`/notifications/...`) for admin/operator roles.
 */
class NotificationService {
  /**
   * Fetches paginated notifications with optional filters and search.
   * @param {Object} opts
   * @param {boolean} [opts.forSelf=false] - Use ownership-scoped endpoint
   * @param {string|null} [opts.username] - Required when forSelf is true
   * @param {boolean|null} [opts.read] - Filter by read state
   * @param {boolean|null} [opts.archived] - Filter by archived state
   * @param {boolean|null} [opts.bookmarked] - Filter by bookmarked state
   * @param {boolean|null} [opts.globally_dismissed] - Filter by global dismissal
   * @param {string|null} [opts.search] - Free-text search across label/text
   * @param {number|null} [opts.limit] - Page size (1-100)
   * @param {number|null} [opts.offset] - Pagination offset
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  getNotifications({
    forSelf = false,
    username = null,
    read = null,
    archived = null,
    bookmarked = null,
    globally_dismissed = null,
    search = null,
    limit = null,
    offset = null,
  } = {}) {
    const path = forSelf ? `/notifications/${username}/all` : "/notifications";
    return api.get(path, {
      params: {
        read,
        archived,
        bookmarked,
        globally_dismissed,
        search,
        limit,
        offset,
      },
    });
  }

  /**
   * Updates per-user state (is_read, is_archived, is_bookmarked) for a notification.
   * Returns 409 if the notification has been globally dismissed.
   * @param {number} id - Notification ID
   * @param {Object} data - State fields to update
   * @param {Object} [opts]
   * @param {boolean} [opts.forSelf=false]
   * @param {string|null} [opts.username]
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  updateNotificationState(id, data, { forSelf = false, username = null } = {}) {
    const path = forSelf
      ? `/notifications/${username}/${id}/state`
      : `/notifications/${id}/state`;
    return api.patch(path, data);
  }

  /**
   * Marks all of the current user's unread, non-dismissed notifications as read.
   * @param {Object} [opts]
   * @param {boolean} [opts.forSelf=false]
   * @param {string|null} [opts.username]
   * @returns {Promise<import('axios').AxiosResponse>} Response body: `{ updated_count }`
   */
  markAllRead({ forSelf = false, username = null } = {}) {
    const path = forSelf
      ? `/notifications/${username}/mark-all-read`
      : "/notifications/mark-all-read";
    return api.patch(path);
  }

  /**
   * Globally dismisses a notification (admin/operator only).
   * Dismissed notifications become non-actionable for all recipients.
   * @param {number} id - Notification ID
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  dismissNotificationGlobally(id) {
    return api.patch(`/notifications/${id}/global-dismiss`);
  }
}

export default new NotificationService();
