import api from "@/services/api";

class NotificationService {
  getNotifications({
    forSelf = false,
    username = null,
    read = null,
    archived = null,
    bookmarked = null,
    globally_dismissed = null,
    search = null,
  } = {}) {
    const path = forSelf ? `/notifications/${username}/all` : "/notifications";
    return api.get(path, {
      params: {
        read,
        archived,
        bookmarked,
        globally_dismissed,
        search,
      },
    });
  }

  updateNotificationState(id, data, { forSelf = false, username = null } = {}) {
    const path = forSelf
      ? `/notifications/${username}/${id}/state`
      : `/notifications/${id}/state`;
    return api.patch(path, data);
  }

  markAllRead({ forSelf = false, username = null } = {}) {
    const path = forSelf
      ? `/notifications/${username}/mark-all-read`
      : "/notifications/mark-all-read";
    return api.patch(path);
  }

  dismissNotificationGlobally(id) {
    return api.patch(`/notifications/${id}/global-dismiss`);
  }
}

export default new NotificationService();
