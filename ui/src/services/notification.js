import api from "@/services/api";

class NotificationService {
  getNotifications({ status = null } = {}) {
    return api.get("/notifications", {
      params: {
        status,
      },
    });
  }
}

export default new NotificationService();
