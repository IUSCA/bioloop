import api from "@/services/api";

export default {
  /**
   * List all groups the current user is a member of.
   * @param {object} [params]
   * @param {boolean} [params.archived] - filter by archived status; omit for all
   *
   * Returns {metadata: {total, offset, limit}, data: [groups]}
   */
  mine({ archived } = {}) {
    const params = {};
    if (archived !== undefined) params.archived = archived;
    return api.get("/groups/mine", { params });
  },

  /**
   * Search groups by name/description or UUID.
   * Platform admins search all groups; others search only accessible groups.
   * Returns {metadata: {total, offset, limit}, data: [groups]}.
   */
  search({
    search_term = "",
    limit = 100,
    offset = 0,
    sort_by = "name",
    sort_order = "asc",
    is_archived,
    direct_membership_only,
    oversight_only,
    admin_only,
  } = {}) {
    return api.post("/groups/search", {
      search_term,
      limit,
      offset,
      sort_by,
      sort_order,
      ...(is_archived !== undefined && { is_archived }),
      ...(direct_membership_only !== undefined && { direct_membership_only }),
      ...(oversight_only !== undefined && { oversight_only }),
      ...(admin_only !== undefined && { admin_only }),
    });
  },

  /** Get group details by ID. */
  get(id) {
    return api.get(`/groups/${id}`);
  },

  /** Create a new top-level group (platform admin only). */
  create({ name, description, allow_user_contributions, metadata } = {}) {
    return api.post("/groups/", {
      name,
      description,
      allow_user_contributions,
      metadata,
    });
  },

  /** Create a child group under the given parent group. */
  createChild(
    parentId,
    { name, description, allow_user_contributions, metadata } = {},
  ) {
    return api.post(`/groups/${parentId}/children`, {
      name,
      description,
      allow_user_contributions,
      metadata,
    });
  },

  /**
   * Update group metadata. Requires `version` for optimistic concurrency control.
   * @param {string} id
   * @param {{ name?, description?, allow_user_contributions?, metadata? }} data
   * @param {number} version - current version from group object
   */
  update(id, data, version) {
    return api.patch(`/groups/${id}`, data, { params: { version } });
  },

  /** Archive a group (soft delete). */
  archive(id) {
    return api.patch(`/groups/${id}/archive`);
  },

  /** Unarchive a group (platform admin only). */
  unarchive(id) {
    return api.patch(`/groups/${id}/unarchive`);
  },

  /**
   * List members of a group (paginated).
   * Returns {metadata:{total, limit, offset}, data: Array<User>}
   */
  getMembers(id, { limit = 100, offset = 0 } = {}) {
    return api.get(`/groups/${id}/members`, { params: { limit, offset } });
  },

  /** Add a single member to a group. */
  addMember(id, userId) {
    return api.put(`/groups/${id}/members/${userId}`);
  },

  /** Remove a single member from a group. */
  removeMember(id, userId) {
    return api.delete(`/groups/${id}/members/${userId}`);
  },

  /** Bulk-add members to a group. */
  bulkAddMembers(id, members) {
    return api.post(`/groups/${id}/members`, { members });
  },

  /** Bulk-remove members from a group. */
  bulkRemoveMembers(id, userIds) {
    return api.delete(`/groups/${id}/members`, { data: { user_ids: userIds } });
  },

  /** Promote a member to group admin role. */
  promoteToAdmin(id, userId) {
    return api.put(`/groups/${id}/admins/${userId}`);
  },

  /** Demote a group admin to member. */
  removeAdmin(id, userId) {
    return api.delete(`/groups/${id}/admins/${userId}`);
  },

  /** Get ancestor groups (hierarchy upward). */
  getAncestors(id) {
    return api.get(`/groups/${id}/ancestors`);
  },

  /** Get descendant groups (hierarchy downward). */
  getDescendants(id) {
    return api.get(`/groups/${id}/descendants`);
  },

  /**
   * List datasets owned by the group.
   * Returns {metadata:{total, limit, offset}, data: Array<Dataset>}
   */
  getDatasets(id) {
    return api.get(`/groups/${id}/datasets`);
  },

  /**
   * List collections owned by the group.
   * Returns {metadata:{total, limit, offset}, data: Array<Collection>}
   */
  getCollections(id) {
    return api.get(`/groups/${id}/collections`);
  },
};
