import api from "@/services/api";

export default {
  /**
   * Fetch audit records with support for the same query parameters
   * expected by the server. The `filter` object will be translated
   * into `filter[...]` query keys, and other options are passed through.
   *
   * @param {Object} options
   * @param {Object} options.filter - keys: event_type, actor_id, subject_id,
   *   resource_id, resource_type, target_type, target_id
   * @param {string} options.startDate
   * @param {string} options.endDate
   * @param {string} options.sortBy
   * @param {string} options.sortOrder
   * @param {number} options.limit
   * @param {number} options.offset
   */
  getAuditRecords(options = {}) {
    const params = {};

    if (options.filter) {
      Object.entries(options.filter).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          // event_type may be provided as an array
          if (key === "event_type" && Array.isArray(value)) {
            params[`filter[${key}]`] = value.join(",");
          } else {
            params[`filter[${key}]`] = value;
          }
        }
      });
    }

    if (options.startDate) params.start_date = options.startDate;
    if (options.endDate) params.end_date = options.endDate;
    if (options.sortBy) params.sort_by = options.sortBy;
    if (options.sortOrder) params.sort_order = options.sortOrder;
    if (options.limit !== undefined) params.limit = options.limit;
    if (options.offset !== undefined) params.offset = options.offset;

    return api.get("/audit/records", { params });
  },
};
