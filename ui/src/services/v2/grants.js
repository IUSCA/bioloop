import api from "@/services/api";

export default {
  /**
   * List grants matching the given filters.
   * @param {object} params
   * @param {'DATASET'|'COLLECTION'} [params.resource_type]
   * @param {number|string} [params.resource_id]
   * @param {'USER'|'GROUP'} [params.subject_type]
   * @param {number|string} [params.subject_id]
   * @param {boolean} [params.active_only] - filter to non-revoked, non-expired grants
   * @param {boolean} [params.expiring_soon] - grants expiring within 30 days
   * @param {number} [params.limit]
   * @param {number} [params.offset]
   *
   * Returns {metadata:{total, limit, offset}, data: Array<Grant>}
   */
  list(params = {}) {
    return api.get("/grants", { params });
  },

  /**
   * Create a new grant (group admin authority required).
   * @param {{
   *   subject_type: 'USER'|'GROUP',
   *   subject_id: number|string,
   *   resource_type: 'DATASET'|'COLLECTION',
   *   resource_id: number|string,
   *   access_type_id: string,
   *   valid_until?: string,
   * }} data
   */
  create(data) {
    return api.post("/grants/", data);
  },

  /**
   * Revoke an active grant.
   * Group admins can only revoke grants on their own group's resources.
   * Platform admins can revoke any grant.
   * @param {string} id - grant UUID
   * @param {string} [reason] - justification (required for platform admin actions)
   */
  revoke(id, reason) {
    return api.post(`/grants/${id}/revoke`, { reason });
  },

  /** List available access types (lookup table). */
  listAccessTypes() {
    return api.get("/grants/access-types");
  },
};
