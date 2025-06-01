import api from "./api";

class AlertService {
  /**
   *
   * @param active    Boolean field to filter datasets by `is_deleted` field
   * @param type       Field to filter alerts by `type`. One of 'INFO', 'WARNING' or 'ERROR'
   * @param label       Field to filter alerts by `name`
   * @param limit      The number of datasets to be retrieved
   * @param offset     Database offset starting at which results will be retrieved
   * @param sortBy     Object containing property to sort datasets by, whose key is the name
   *                   of said property, and value is one of 'asc' or 'desc'
   * @returns {Promise<Object>} A promise that resolves to an object containing alerts and metadata
   */
  getAll({
    label = "",
    type = null,
    active = true,
    limit = 10,
    offset = 0,
    sortBy = null,
  } = {}) {
    return api.get(`/alerts`, {
      params: {
        label,
        type,
        active,
        limit,
        offset,
        sortBy,
      },
    });
  }

  /**
   * Create a new alert
   * @param {Object} alertData - The data for the new alert
   * @param {string} alertData.label - The label of the alert
   * @param {string} alertData.message - The message of the alert
   * @param {string} alertData.type - The type of the alert ('INFO', 'WARNING', or 'ERROR')
   * @param {boolean} alertData.active - Whether the alert is active
   * @param {boolean} alertData.global - Whether the alert is global
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
   * @param {boolean} [alertData.active] - The updated active status of the alert
   * @param {boolean} [alertData.global] - The updated global status of the alert
   * @returns {Promise<Object>} A promise that resolves to the updated alert object
   */
  update(id, alertData) {
    return api.patch(`/alerts/${id}`, alertData);
  }

  /**
   * Delete an alert (soft delete by setting active to false)
   * @param {number} id - The ID of the alert to delete
   * @returns {Promise<void>} A promise that resolves when the alert is successfully deleted
   */
  delete(id) {
    return api.delete(`/alerts/${id}`);
  }
}

export default new AlertService();
