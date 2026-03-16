import api from "@/services/api";

export default {
  /**
   * Get aggregate dataset statistics.
   * @param {{ type?: 'RAW_DATA'|'DATA_PRODUCT' }} [params]
   */
  getStats(params = {}) {
    return api.get("/v2/datasets/stats", { params });
  },

  search(params = {}) {
    return api.get("/v2/datasets/", { params });
  },

  /** Get a single dataset by ID. */
  get(id, params = {}) {
    return api.get(`/v2/datasets/${id}`, { params });
  },

  /** Archive a dataset. */
  archive(id) {
    return api.patch(`/v2/datasets/${id}`, { is_deleted: true });
  },

  /** Update dataset metadata. */
  update(id, data) {
    return api.patch(`/v2/datasets/${id}`, data);
  },
};
