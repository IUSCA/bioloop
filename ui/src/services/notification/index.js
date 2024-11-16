import datasetNotificationService from "@/services/notification/dataset";
import constants from "@/constants";

class NotificationService {
  async getNotifications() {
    try {
      // retrieve notifications pertaining to datasets
      await datasetNotificationService.getDatasetNotifications({
        status: constants.NOTIFICATION_STATUS.CREATED,
        dataset_state: constants.DATASET_STATES.DUPLICATE_REGISTERED,
      });
      // await other kinds of notifications here
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }
}

export default new NotificationService();
