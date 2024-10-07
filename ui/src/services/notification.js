import api from "@/services/api";

class NotificationService {
  getNotifications({
    by_active_action_items = true,
    active = true,
    status = null,
  } = {}) {
    return api.get("/notifications", {
      params: {
        by_active_action_items,
        active,
        status,
      },
    });
  }
}

export default new NotificationService();
