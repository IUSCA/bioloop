import api from "@/services/api";

/* List grants for a subject */
function listGrantsForSubject(subject_type, subject_id, params = {}) {
  return api.get(`/grants/subject/${subject_type}/${subject_id}`, { params });
}

/* List grants for a resource */
function listGrantsForResource(resource_type, resource_id, params = {}) {
  return api.get(`/grants/resource/${resource_type}/${resource_id}`, {
    params,
  });
}

export default {
  listGrantsForSubject,
  listGrantsForResource,

  listGrantsForDataset(resource_id, params = {}) {
    return listGrantsForResource("DATASET", resource_id, params);
  },
  listGrantsForCollection(resource_id, params = {}) {
    return listGrantsForResource("COLLECTION", resource_id, params);
  },
  listGrantsForGroup(subject_id, params = {}) {
    return listGrantsForSubject("GROUP", subject_id, params);
  },
  listGrantsForUser(subject_id, params = {}) {
    return listGrantsForSubject("USER", subject_id, params);
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
