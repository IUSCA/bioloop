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

function countGrantsForResource(resource_type, resource_id) {
  return api.get(`/grants/resource/${resource_type}/${resource_id}/count`);
}

export default {
  listGrantsForSubject,
  listGrantsForResource,
  listGrantsForSubjectGrouped(subject_type, subject_id, params = {}) {
    return api.get(`/grants/subject/${subject_type}/${subject_id}`, {
      params,
    });
  },
  listGrantsForResourceGrouped(resource_type, resource_id, params = {}) {
    return api.get(`/grants/resource/${resource_type}/${resource_id}`, {
      params,
    });
  },
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
  countGrantsForCollection(resource_id) {
    return countGrantsForResource("COLLECTION", resource_id);
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

  /**
   * Revoke all active grants for a subject on a resource in a single transaction.
   * @param {'USER'|'GROUP'} subject_type
   * @param {string} subject_id
   * @param {'DATASET'|'COLLECTION'} resource_type
   * @param {string} resource_id
   * @param {string} [reason]
   */
  revokeAll(subject_type, subject_id, resource_type, resource_id, reason) {
    return api.post(
      `/grants/${subject_type}/${subject_id}/${resource_type}/${resource_id}/revoke-all`,
      { reason },
    );
  },

  /** List available access types (lookup table). */
  listAccessTypes(resourceType) {
    return api.get("/grants/access-types", {
      params: { resource_type: resourceType },
    });
  },

  /** List available presets. */
  listGrantPresets(resourceType) {
    return api.get("/grants/presets", {
      params: { resource_type: resourceType },
    });
  },

  expiringGrants(params = {}) {
    return api.get("/grants/expiring-soon", { params });
  },

  computeEffectiveGrants(data) {
    return api.post("/grants/compute-effective-grants", data);
  },

  /**
   * Get all grants for a specific subject on a specific resource (expanded detail).
   * Maps to GET /grants/:subject_type/:subject_id/:resource_type/:resource_id
   * @param {'USER'|'GROUP'} subject_type
   * @param {string} subject_id
   * @param {'DATASET'|'COLLECTION'} resource_type
   * @param {string} resource_id
   * @param {{ is_active?: boolean }} [params]
   */
  getGrantsForSubject(
    subject_type,
    subject_id,
    resource_type,
    resource_id,
    params = {},
  ) {
    return api.get(
      `/grants/${subject_type}/${subject_id}/${resource_type}/${resource_id}`,
      { params },
    );
  },
};
