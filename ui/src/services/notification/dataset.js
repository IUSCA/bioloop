import api from "@/services/api";

class DatasetNotificationService {
  getDatasetNotifications({ dataset_state = null, status = null } = {}) {
    return api.get("/datasetNotifications", {
      params: {
        dataset_state,
        status,
      },
    });
  }
}

export default new DatasetNotificationService();
