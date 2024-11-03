import UploadApi from "./uploadApi";
import api from "../api";

class UploadService {
  constructor() {
    this.uploadApi = new UploadApi();
    this.uploadAxios = this.uploadApi.axiosInstance;
  }

  setToken(token) {
    this.uploadApi.setToken(token);
  }

  getUploadLogs({ status = null, dataset_name = null } = {}) {
    return api.get(`/uploads`, {
      params: {
        status,
        dataset_name,
      },
    });
  }

  logUpload(data) {
    return api.post("/uploads", data);
  }

  updateUploadLog(upload_log_id, data) {
    return api.patch(`/uploads/${upload_log_id}`, data);
  }

  updateFileUploadLog(upload_log_id, file_upload_log_id, data) {
    return api.patch(
      `/uploads/${upload_log_id}/file-upload-log/${file_upload_log_id}`,
      data,
    );
  }

  uploadFile(data) {
    return this.uploadAxios.post("/upload", data);
  }
}

export default new UploadService();
