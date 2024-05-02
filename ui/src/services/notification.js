import api from "@/services/api";

class NotificationService {
  getNotifications({ active = true, status = null } = {}) {
    return api.get("/notifications", {
      params: {
        active,
        status,
      },
    });
  }
}

export default new NotificationService();
