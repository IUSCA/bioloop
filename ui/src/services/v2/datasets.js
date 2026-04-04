import api from "@/services/api";

export default {
  /**
   * Search datasets accessible to the current user.
   * Returns {metadata: {total, offset, limit}, data: [datasets]}.
   */
  search(params = {}) {
    return api.get("/v2/datasets/", { params });
  },

  /**
   * Get a single dataset by ID (resource_id).
   * Returns dataset with _meta: { caller_role, capabilities }.
   */
  get(id) {
    return api.get(`/v2/datasets/${id}`);
  },

  /**
   * Update dataset metadata (name, description).
   * @param {string} id - dataset resource_id
   * @param {{ name?: string, description?: string }} data
   */
  update(id, data) {
    return api.patch(`/v2/datasets/${id}`, data);
  },

  /**
   * Archive (soft-delete) a dataset.
   * @param {string} id - dataset resource_id
   */
  archive(id) {
    return api.post(`/v2/datasets/${id}/archive`);
  },

  /**
   * List files in a dataset directory.
   * @param {{ id: string, basepath?: string }}
   */
  listFiles({ id, basepath = "" } = {}) {
    return api.get(`/v2/datasets/${id}/files`, { params: { basepath } });
  },

  /**
   * Search files in a dataset.
   * @param {{ id: string, name?: string, basepath?: string, filetype?: string, min_file_size?: number, max_file_size?: number, sort_by?: string, sort_order?: string }}
   */
  searchFiles({
    id,
    name = "",
    basepath = "",
    filetype,
    extension,
    min_file_size,
    max_file_size,
    sort_by = "name",
    sort_order = "asc",
    skip = 0,
    take = 1000,
  } = {}) {
    return api.get(`/v2/datasets/${id}/files/search`, {
      params: {
        name,
        basepath,
        filetype,
        extension,
        min_file_size,
        max_file_size,
        sort_by,
        sort_order,
        skip,
        take,
      },
    });
  },

  /**
   * Get the file tree for a dataset.
   * @param {string} id - dataset resource_id
   */
  getFileTree(id) {
    return api.get(`/v2/datasets/${id}/files/tree`);
  },

  /**
   * Get download info for a specific file.
   * @param {{ id: string, file_id: number }}
   */
  getFileDownloadInfo({ id, file_id } = {}) {
    return api.get(`/v2/datasets/${id}/files/${file_id}/download_info`);
  },

  /**
   * Get download info for the entire dataset as a bundle (zip/tar).
   * @param {string} id - dataset resource_id
   */
  getBundleDownloadInfo(id) {
    return api.get(`/v2/datasets/${id}/files/bundle/download_info`);
  },

  /**
   * Run a workflow on the dataset (stage or integrated).
   * @param {{ id: string, workflow_type: 'stage'|'integrated' }}
   */
  runWorkflow({ id, workflow_type } = {}) {
    return api.post(`/v2/datasets/${id}/workflows/run/${workflow_type}`);
  },
};
