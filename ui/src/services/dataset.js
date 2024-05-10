import config from "@/config";
import toast from "@/services/toast";
import api from "./api";

class DatasetService {
  /**
   *
   * @param deleted          Boolean field to filter datasets by `is_deleted` field
   * @param processed        Field to filter datasets by number of associated workflows. Can be one of
   *                         'some' or 'none'
   * @param archived         Boolean field to filter datasets by the presence/absence of `archive_path`
   *                         field
   * @param staged           Boolean field to filter datasets by `is_deleted` field
   * @param type             Field to filter datasets by `type`. One of 'RAW_DATA' or 'DATA_PRODUCT'
   * @param name             Field to filter datasets by `name`
   * @param match_name_exact Boolean field to determine whether records will be matched by
   *                         exact or matching values of `name`
   * @param limit            The number of datasets to be retrieved
   * @param offset           Database offset starting at which results will be retrieved
   * @param sortBy           Object containing property to sort datasets by, whose key is the name
   *                         of said property, and value is one of 'asc' or 'desc'
   * @returns                Object containing matching datasets, and count of matching datasets
   */
  getAll({
    deleted = null,
    processed = null,
    archived = null,
    staged = null,
    type = null,
    name = null,
    match_name_exact = null,
    limit = null,
    offset = null,
    sortBy = null,
  } = {}) {
    return api.get("/datasets", {
      params: {
        deleted,
        processed,
        archived,
        staged,
        type,
        name,
        match_name_exact,
        limit,
        offset,
        sortBy,
      },
    });
  }

  getById({
    id,
    files = false,
    workflows = true,
    last_task_run = false,
    prev_task_runs = false,
    only_active = false,
    include_uploading_derived_datasets = false,
    bundle = false,
  }) {
    return api.get(`/datasets/${id}`, {
      params: {
        files,
        workflows,
        last_task_run,
        prev_task_runs,
        only_active,
        bundle,
        include_uploading_derived_datasets,
      },
    });
  }

  getDatasetFileTypes() {
    return api.get("/datasets/file-types");
  }

  getUploadLogs({ status = null, dataset_name = null } = {}) {
    return api.get(`/datasets/upload-logs`, {
      params: {
        status,
        dataset_name,
      },
    });
  }

  logUpload(data) {
    return api.post("/datasets/upload-log", data);
  }

  updateUploadLog(upload_id, data) {
    return api.patch(`/datasets/upload-log/${upload_id}`, data);
  }

  updateFileUploadLog(file_log_id, data) {
    return api.patch(`/datasets/file-upload-log/${file_log_id}`, data);
  }

  processUpload(dataset_id) {
    return api.post(`/datasets/${dataset_id}/upload/process`);
  }

  stage_dataset(id) {
    return api
      .post(`/datasets/${id}/workflow/stage`)
      .then(() => {
        toast.success("A workflow has started to stage the dataset");
      })
      .catch((err) => {
        console.error("unable to stage the dataset", err);
        toast.error("Unable to stage the dataset");
        return Promise.reject(err);
      });
  }

  archive_dataset(id) {
    return api.post(`/datasets/${id}/workflow/integrated`);
  }

  delete_dataset({ id, soft_delete = true }) {
    return api.delete(`/datasets/${id}`, {
      params: {
        soft_delete,
      },
    });
  }

  getStats({ type }) {
    return api.get("/datasets/stats", {
      params: {
        type,
      },
    });
  }

  update({ id, updated_data }) {
    return api.patch(`/datasets/${id}`, updated_data);
  }

  list_files({ id, basepath }) {
    return api.get(`/datasets/${id}/files`, {
      params: {
        basepath,
        id: config.file_browser.cache_busting_id,
      },
    });
  }

  get_file_download_data({ dataset_id, file_id }) {
    return api.get(`/datasets/download/${dataset_id}`, {
      params: { file_id },
    });
  }

  search_files({
    id,
    name,
    location,
    skip,
    take,
    extension,
    filetype,
    minSize,
    maxSize,
  }) {
    return api.get(`/datasets/${id}/files/search`, {
      params: {
        name,
        basepath: location,
        skip,
        take,
        extension,
        filetype,
        min_file_size: minSize,
        max_file_size: maxSize,
      },
    });
  }

  uploadFile(data) {
    return api.post("/datasets/upload", data);
  }
}

export default new DatasetService();
