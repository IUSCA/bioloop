import api from "@/services/api";

class NotificationService {
  getNotifications({
    read = null,
    archived = null,
    bookmarked = null,
    search = null,
  } = {}) {
    return api.get("/notifications", {
      params: {
        read,
        archived,
        bookmarked,
        search,
      },
    });
  }

  updateNotificationState(id, data) {
    return api.patch(`/notifications/${id}/state`, data);
  }
}

export default new NotificationService();
