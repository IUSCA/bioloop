import api from "@/services/api";

export default {
  /**
   * Groups the current user may give a new dataset to.
   * Each row carries `admitted_by`: PLATFORM_ADMIN, ADMIN, or CONTRIBUTOR.
   */
  eligibleOwnerGroups() {
    return api.get("/v2/datasets/eligible-owner-groups");
  },

  /**
   * Whether a name is free for a new dataset of this type in one group.
   * Scoped: it says nothing about names any other group holds.
   */
  nameAvailable({ name, type, owner_group_id }) {
    return api.get("/v2/datasets/name-available", {
      params: { name, type, owner_group_id },
    });
  },

  /**
   * Register a directory that already exists on disk as a dataset. Nothing is copied.
   */
  import(data) {
    return api.post("/v2/datasets/imports", data);
  },

  /**
   * Register a dataset that is about to be uploaded from this browser.
   * Returns the upload log; the transfer itself goes to the TUS server.
   */
  registerUpload(data) {
    return api.post("/v2/datasets/uploads", data);
  },

  /**
   * The upload log for one dataset.
   */
  uploadLog(id) {
    return api.get(`/v2/datasets/${id}/upload-log`);
  },

  /**
   * Tell the API a transfer has finished, so it moves the files and starts verification.
   *
   * Deliberately the existing endpoint: everything after registration keys on the numeric
   * dataset id and the upload log, never on which route created the dataset, so there is no
   * v2 equivalent to build. Takes the numeric dataset id, not the resource id.
   */
  completeUpload(datasetId, data) {
    return api.post(`/datasets/uploads/${datasetId}/complete`, data);
  },

  /**
   * Search datasets accessible to the current user.
   * Returns {metadata: {total, offset, limit}, data: [datasets]}.
   */
  search(params = {}) {
    return api.get("/v2/datasets/", { params });
  },

  /**
   * Get a single dataset by ID (resource_id).
   * Returns dataset with _meta: { standing, capabilities }.
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
   * Delete a dataset, keeping its record.
   * @param {string} id - dataset resource_id
   */
  delete(id) {
    return api.delete(`/v2/datasets/${id}`);
  },

  /**
   * List files in a dataset directory.
   * @param {{ id: string, basepath?: string }}
   */
  listFiles({ id, basepath = "" } = {}) {
    return api.get(`/v2/datasets/${id}/files`, {
      params: { basepath },
    });
  },

  getSourceDatasets(dataset_id, options = {}) {
    return api.get(`/v2/datasets/${dataset_id}/source-datasets`, {
      params: options,
    });
  },

  getDerivedDatasets(dataset_id, options = {}) {
    return api.get(`/v2/datasets/${dataset_id}/derived-datasets`, {
      params: options,
    });
  },

  /**
   * Search files in a dataset.
   *
   * Takes the arguments `FileBrowser` passes to its `searchFiles` prop, the same ones the legacy
   * `search_files` takes, and maps them onto the route's query names.
   * @param {{ id: string, name?: string, location?: string, filetype?: string, extension?: string, minSize?: number, maxSize?: number, sortBy?: string, sortOrder?: string, skip?: number, take?: number }}
   */
  searchFiles({
    id,
    name,
    location,
    filetype,
    extension,
    minSize,
    maxSize,
    sortBy,
    sortOrder,
    skip,
    take,
  } = {}) {
    return api.get(`/v2/datasets/${id}/files/search`, {
      params: {
        name,
        basepath: location,
        filetype,
        extension,
        min_file_size: minSize,
        max_file_size: maxSize,
        sort_by: sortBy,
        sort_order: sortOrder,
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

  /**
   * List the workflow runs associated with a dataset.
   * Requires the view_workflows capability; the API returns 403 otherwise.
   * @param {string} id - dataset resource_id
   */
  listWorkflows(id, params = {}) {
    return api.get(`/v2/datasets/${id}/workflows`, { params });
  },

  /**
   * Stop or resume one of a dataset's runs.
   * Needs the same capability as launching that workflow type.
   * @param {{ id: string, workflow_id: string, verb: 'pause'|'resume' }}
   */
  controlWorkflow({ id, workflow_id, verb } = {}) {
    return api.post(`/v2/datasets/${id}/workflows/${workflow_id}/${verb}`);
  },

  /**
   * The file name a downloaded bundle is saved as. The last segment of the path the API
   * serves it from, kept in step with getBundleDownloadPath in the v2 files service.
   * @see docs/design/groups/dataset-storage.md — Download
   */
  getBundleName(dataset) {
    return `${dataset?.name}.tar`;
  },
};
