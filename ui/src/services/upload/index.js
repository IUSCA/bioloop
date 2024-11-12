import api from "../api";
import UploadApi from "./uploadApi";
import config from "@/config";

class UploadService {
  constructor() {
    this.uploadApi = new UploadApi();
    this.uploadAxios = this.uploadApi.axiosInstance;
  }

  setToken(token) {
    this.uploadApi.setToken(token);
  }

  getDatasetUploadLogs({
    status = null,
    dataset_name = null,
    limit = null,
    offset = null,
  } = {}) {
    return api.get(`/datasetUploads`, {
      params: {
        status,
        dataset_name,
        offset,
        limit,
      },
    });
  }

  logDatasetUpload(data) {
    return api.post(`/datasetUploads`, data);
  }

  // todo - all usages - use dataset_upload_log_id, and change args/returns
  // todo - rename this to datasetUploadService
  // todo - would it be better to expose use datasetId instead of
  //  dataset_upload_log_id to identify the upload?
  updateDatasetUploadLog(dataset_id, data) {
    return api.patch(`/datasetUploads/${dataset_id}`, data);
  }

  processDatasetUpload(dataset_id) {
    return api.post(`/datasetUploads/${dataset_id}/process`);
  }

  cancelDatasetUpload(dataset_id) {
    return api.post(`/datasetUploads/${dataset_id}/cancel`);
  }

  // todo - separate upload service from token service
  uploadFile(data) {
    return this.uploadAxios.post("/upload", data);
  }
}

export default new UploadService();
