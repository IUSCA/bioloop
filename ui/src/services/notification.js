import api from "@/services/api";

class NotificationService {
  getNotification({ notification_id } = {}) {
    return api.get(`/notifications/${notification_id}`);
  }

  getNotifications({ by_active_action_items = true } = {}) {
    return api.get("/notifications", {
      params: {
        by_active_action_items,
      },
    });
  }

  // updateNotificationStatus({ notification_id, status } = {}) {
  //   return api.patch(`/notifications/${notification_id}/${status}}`);
  // }
}

export default new NotificationService();
