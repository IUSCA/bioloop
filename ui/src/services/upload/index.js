import UploadApi from "./uploadApi";
import api from "../api";

class UploadService {
  constructor() {
    this.uploadApi = new UploadApi();
    this.axios = this.uploadApi.axiosInstance;
  }

  setToken(token) {
    this.uploadApi.setToken(token);
  }

  getUploadLogs({ status = null, dataset_name = null } = {}) {
    return api.get(`/upload/logs`, {
      params: {
        status,
        dataset_name,
      },
    });
  }

  logUpload(data) {
    return api.post("/upload/log", data);
  }

  updateUploadLog(upload_log_id, data) {
    return api.patch(`/upload/log/${upload_log_id}`, data);
  }

  updateFileUploadLog(file_log_id, data) {
    return api.patch(`/upload/file-upload-log/${file_log_id}`, data);
  }

  uploadFile(data) {
    return this.axios.post("/upload", data);
  }
}

export default new UploadService();
