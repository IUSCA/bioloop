import api from "@/services/api";

class NotificationService {
  getNotification({ notification_id } = {}) {
    return api.get(`/notifications/${notification_id}`);
  }

  getNotifications({ active = true } = {}) {
    return api.get("/notifications", {
      params: {
        active,
      },
    });
  }

  updateNotificationStatus({ notification_id, status } = {}) {
    return api.patch(`/notifications/${notification_id}/${status}}`);
  }
}

export default new NotificationService();
