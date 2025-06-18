import api from "./api";

class AlertService {
  /**
   *
   * @param type       Field to filter alerts by `type`. One of 'INFO', 'WARNING' or 'ERROR'
   * @param label       Field to filter alerts by `name`
   * @param message     Field to filter alerts by `message`
   * @param active      If true, only active alerts (i.e. alerts with start_time in the past and end_time in the future) will be returned
   * @param start_time ISO 8601 string representing the start time to filter alerts starting after this time
   * @param start_time_operator Operator to use for comparing alert's `start_time` (lt, lte, gt, gte) with the `start_time` provided
   * @param end_time   ISO 8601 string representing the end time to filter alerts ending before this time
   * @param end_time_operator Operator to use for comparing alert's `end_time` (lt, lte, gt, gte) with the `end_time` provided
   * @param limit      The number of alerts to be retrieved
   * @param offset     Database offset starting at which results will be retrieved
   * @param sort_by     Property to sort alerts by
   * @param sort_order  Sort order ('asc' or 'desc')
   * @returns {Promise<Object>} A promise that resolves to an object containing alerts and metadata
   */
  getAll({
    label = "",
    message = "",
    type = null,
    active = false,
    start_time = null,
    start_time_operator = null,
    end_time = null,
    end_time_operator = null,
    limit = null,
    offset = null,
    sort_by = null,
    sort_order = null,
  } = {}) {
    return api.get(`/alerts`, {
      params: {
        label,
        message,
        type,
        active,
        start_time,
        start_time_operator,
        end_time,
        end_time_operator,
        limit,
        offset,
        sort_by,
        sort_order,
      },
    });
  }

  /**
   * Create a new alert
   * @param {Object} alertData - The data for the new alert
   * @param {string} alertData.label - The label of the alert
   * @param {string} alertData.message - The message of the alert
   * @param {string} alertData.type - The type of the alert ('INFO', 'WARNING', or 'ERROR')
   * @param {string} [alertData.start_time] - ISO 8601 string representing when the alert should become active
   * @param {string} [alertData.end_time] - ISO 8601 string representing when the alert should expire
   * @returns {Promise<Object>} A promise that resolves to the created alert object
   */
  create(alertData) {
    return api.post("/alerts", alertData);
  }

  /**
   * Update an existing alert
   * @param {number} id - The ID of the alert to update
   * @param {Object} alertData - The data to update the alert with
   * @param {string} [alertData.label] - The updated label of the alert
   * @param {string} [alertData.message] - The updated message of the alert
   * @param {string} [alertData.type] - The updated type of the alert ('INFO', 'WARNING', or 'ERROR')
   * @param {string} [alertData.start_time] - ISO 8601 string representing the updated start time of the alert
   * @param {string} [alertData.end_time] - ISO 8601 string representing the updated end time of the alert
   * @returns {Promise<Object>} A promise that resolves to the updated alert object
   */
  update(id, alertData) {
    return api.patch(`/alerts/${id}`, alertData);
  }

  // /**
  //  * Delete an alert (soft delete by setting active to false)
  //  * @param {number} id - The ID of the alert to delete
  //  * @returns {Promise<void>} A promise that resolves when the alert is successfully deleted
  //  */
  // delete(id) {
  //   return api.delete(`/alerts/${id}`);
  // }

  getAlertIcon(alertType) {
    switch (alertType) {
      case "ERROR":
        return "warning";
      case "WARNING":
        return "warning";
      case "INFO":
        return "info";
      default:
        return "info";
    }
  }

  getAlertColor(alertType) {
    switch (alertType) {
      case "ERROR":
        return "danger";
      case "WARNING":
        return "warning";
      case "INFO":
        return "info";
      default:
        return "info";
    }
  }
}

export default new AlertService();
