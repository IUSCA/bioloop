import api from "./api";

class AlertService {
  /**
   *
   * @param type       Field to filter alerts by `type`. One of 'INFO', 'WARNING' or 'ERROR'
   * @param label       Field to filter alerts by `name`
   * @param message     Field to filter alerts by `message`
   * @param status      Field to filter alerts by `status`. One of 'SCHEDULED', 'ACTIVE', or 'EXPIRED'
   * @param is_hidden   Field to filter alerts by `is_hidden`. If true, only hidden alerts will be returned
   * @param start_time  Object containing the start time to filter alerts starting after/before this time
   * @param end_time    Object containing the end time to filter alerts ending after/before this time
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
    start_time = null,
    end_time = null,
    is_hidden = false,
    status = null,
    limit = null,
    offset = null,
    sort_by = null,
    sort_order = null,
  } = {}) {
    const params = {
      label,
      message,
      type,
      is_hidden,
      status,
      limit,
      offset,
      sort_by,
      sort_order,
    };

    // Add date filters with operators
    if (start_time && typeof start_time === "object") {
      Object.keys(start_time).forEach((operator) => {
        if (start_time[operator]) {
          params[`start_time[${operator}]`] =
            start_time[operator].toISOString();
        }
      });
    }
    if (end_time && typeof end_time === "object") {
      Object.keys(end_time).forEach((operator) => {
        if (end_time[operator]) {
          params[`end_time[${operator}]`] = end_time[operator].toISOString();
        }
      });
    }

    return api.get(`/alerts`, { params });
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

  getTypes() {
    return api.get("/alerts/types");
  }

  getStatuses() {
    return api.get("/alerts/statuses");
  }

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

  getStatusColor(status) {
    switch (status) {
      case "SCHEDULED":
        return "secondary";
      case "ACTIVE":
        return "primary";
      case "EXPIRED":
        return "warning";
      default:
        return "secondary";
    }
  }

  getIconColor(type) {
    switch (type) {
      case "ERROR":
        return "#ef4444";
      case "WARNING":
        return "#f59e0b";
      case "INFO":
        return "#3b82f6";
      default:
        return "#3b82f6";
    }
  }
}

export default new AlertService();
