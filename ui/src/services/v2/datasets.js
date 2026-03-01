import api from '@/services/api'

export default {
  /**
   * Get aggregate dataset statistics.
   * @param {{ type?: 'RAW_DATA'|'DATA_PRODUCT' }} [params]
   */
  getStats(params = {}) {
    return api.get('/datasets/v2/stats', { params })
  },

  /**
   * List/search datasets with rich filters.
   * @param {object} [params]
   * @param {string} [params.search]
   * @param {number[]} [params.owner_group_ids]
   * @param {string[]} [params.collection_ids]
   * @param {boolean} [params.shared_with_me] - datasets accessible via grant to caller
   * @param {boolean} [params.contributed_by_user] - datasets the caller contributed
   * @param {boolean} [params.is_deleted]
   * @param {number} [params.limit]
   * @param {number} [params.offset]
   * @param {string} [params.sort_by]
   * @param {'asc'|'desc'} [params.sort_order]
   */
  list(params = {}) {
    return api.get('/datasets/v2/', { params })
  },

  /** Get a single dataset by ID. */
  get(id, params = {}) {
    return api.get(`/datasets/v2/${id}`, { params })
  },

  /** Archive a dataset. */
  archive(id) {
    return api.patch(`/datasets/v2/${id}`, { is_deleted: true })
  },

  /** Update dataset metadata. */
  update(id, data) {
    return api.patch(`/datasets/v2/${id}`, data)
  },
}
