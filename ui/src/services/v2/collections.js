import api from "@/services/api";

export default {
  /**
   * Search collections accessible to the current user.
   * Returns {metadata: {total, offset, limit}, data: [collections]}.
   */
  search(params) {
    return api.post("/collections/search", params);
  },

  /** Get a collection by ID. */
  get(id) {
    return api.get(`/collections/${id}`);
  },

  /** Create a new collection. Requires `owner_group_id`. */
  create({ name, description, owner_group_id, metadata, dataset_ids } = {}) {
    return api.post("/collections/", {
      name,
      description,
      owner_group_id,
      metadata,
      dataset_ids,
    });
  },

  /**
   * Update collection metadata.
   * `version` must be included in data for optimistic concurrency control.
   * @param {string} id
   * @param {object} data
   * @param {number} version
   */
  update(id, data, version) {
    return api.patch(`/collections/${id}`, { ...data, version });
  },

  /** Permanently delete a collection. */
  delete(id) {
    return api.delete(`/collections/${id}`);
  },

  /** Archive a collection. */
  archive(id) {
    return api.post(`/collections/${id}/archive`);
  },

  /** Unarchive a collection. */
  unarchive(id) {
    return api.post(`/collections/${id}/unarchive`);
  },

  /**
   * List datasets within the collection. Each row carries `_meta.can_view_metadata`,
   * because a caller may browse a collection holding datasets they cannot open.
   * @param {string} id
   * @param {{limit?: number, offset?: number, name?: string, sort_by?: string, sort_order?: string}} [params]
   */
  getDatasets(id, params) {
    return api.get(`/collections/${id}/datasets`, { params });
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

  /**
   * Stage datasets in a collection. Omit dataset_ids to stage the whole collection.
   * Authorization is per dataset; the response reports staged, denied, and skipped.
   * @param {string} id - collection id
   * @param {{ dataset_ids?: string[] }} body
   */
  stageDatasets(id, body = {}) {
    return api.post(`/collections/${id}/stage`, body);
  },
};
