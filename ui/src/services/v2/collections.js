import api from "@/services/api";

export default {
  /**
   * Search collections accessible to the current user.
   * Returns {metadata: {total, offset, limit}, data: [collections]}.
   */
  search({
    search_term = "",
    limit = 100,
    offset = 0,
    sort_by = "name",
    sort_order = "asc",
    owner_group_id,
    is_archived,
  } = {}) {
    return api.post("/collections/search", {
      search_term,
      limit,
      offset,
      sort_by,
      sort_order,
      ...(owner_group_id !== undefined && { owner_group_id }),
      ...(is_archived !== undefined && { is_archived }),
    });
  },

  /** Get a collection by ID. */
  get(id) {
    return api.get(`/collections/${id}`);
  },

  /** Create a new collection. Requires `owner_group_id`. */
  create({ name, description, owner_group_id, metadata } = {}) {
    return api.post("/collections/", {
      name,
      description,
      owner_group_id,
      metadata,
    });
  },

  /**
   * Update collection metadata.
   * `version` must be included in data for optimistic concurrency control.
   */
  update(id, data) {
    return api.patch(`/collections/${id}`, data);
  },

  /** Permanently delete a collection. */
  delete(id) {
    return api.delete(`/collections/${id}`);
  },

  /** Archive a collection. */
  archive(id) {
    return api.patch(`/collections/${id}/archive`);
  },

  /** Unarchive a collection (platform admin only). */
  unarchive(id) {
    return api.patch(`/collections/${id}/unarchive`);
  },

  /** List datasets within the collection. */
  getDatasets(id) {
    return api.get(`/collections/${id}/datasets`);
  },

  /**
   * Add one or more datasets to the collection.
   * Adding a dataset is a high-impact authorization operation — caller must hold admin authority
   * over the dataset's owning group.
   * @param {number|string} id - collection ID
   * @param {number[]} datasetIds
   */
  addDatasets(id, datasetIds) {
    return api.post(`/collections/${id}/datasets`, { dataset_ids: datasetIds });
  },

  /** Remove a single dataset from the collection. */
  removeDataset(id, datasetId) {
    return api.delete(`/collections/${id}/datasets/${datasetId}`);
  },

  /** Bulk-remove datasets from the collection. */
  bulkRemoveDatasets(id, datasetIds) {
    return api.delete(`/collections/${id}/datasets`, {
      data: { dataset_ids: datasetIds },
    });
  },
};
