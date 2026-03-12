import api from "@/services/api";

export default {
  /**
   * Get aggregate dataset statistics.
   * @param {{ type?: 'RAW_DATA'|'DATA_PRODUCT' }} [params]
   */
  getStats(params = {}) {
    return api.get("/datasets/v2/stats", { params });
  },

  search(params = {}) {
    return api.get("/datasets/v2/", { params });
  },

  /** Get a single dataset by ID. */
  get(id, params = {}) {
    return api.get(`/datasets/v2/${id}`, { params });
  },

  /** Archive a dataset. */
  archive(id) {
    return api.patch(`/datasets/v2/${id}`, { is_deleted: true });
  },

  /** Update dataset metadata. */
  update(id, data) {
    return api.patch(`/datasets/v2/${id}`, data);
  },
};
