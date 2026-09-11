import api from "@/services/api";

function resourceAuditParams(options = {}) {
  const params = {};
  if (options.eventType) {
    params.event_type = Array.isArray(options.eventType)
      ? options.eventType.join(",")
      : options.eventType;
  }
  if (options.startDate) params.start_date = options.startDate;
  if (options.endDate) params.end_date = options.endDate;
  if (options.sortOrder) params.sort_order = options.sortOrder;
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.offset !== undefined) params.offset = options.offset;
  return params;
}

export default {
  /**
   * Fetch audit records with support for the same query parameters
   * expected by the server. The `filter` object will be translated
   * into `filter[...]` query keys, and other options are passed through.
   *
   * @param {Object} options
   * @param {Object} options.filter - keys: event_type, actor_id, subject_id,
   *   resource_id, resource_type, target_type, target_id, subject_type, subject_id
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

  /**
   * Fetch the audit records for one resource, from that resource's own endpoint.
   *
   * These endpoints are authorized by `<resource>.view_audit_logs`, so an owning-group
   * admin or an oversight authority can read them. `getAuditRecords` above hits the
   * platform-wide log, which is platform-admin only.
   *
   * Each returns `{ metadata: { count }, data: [...] }`.
   *
   * @param {string} id - dataset `resource_id`, collection id, or group id
   * @param {Object} [options] - event_type, startDate, endDate, sortOrder, limit, offset
   */
  getDatasetAuditRecords(id, options = {}) {
    return api.get(`/v2/datasets/${id}/audit`, {
      params: resourceAuditParams(options),
    });
  },

  getCollectionAuditRecords(id, options = {}) {
    return api.get(`/collections/${id}/audit`, {
      params: resourceAuditParams(options),
    });
  },

  getGroupAuditRecords(id, options = {}) {
    return api.get(`/groups/${id}/audit`, {
      params: resourceAuditParams(options),
    });
  },
};
