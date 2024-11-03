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

  getUploadLogs({
    status = null,
    upload_type = null,
    entity_name = null,
  } = {}) {
    return api.get(`/uploads`, {
      params: {
        status,
        upload_type,
        entity_name,
      },
    });
  }

  logDatasetUpload(data) {
    return api.post("/uploads/dataset", data);
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

  processUpload(upload_log_id) {
    return api.post(`/uploads/${upload_log_id}/process`);
  }

  uploadFile(data) {
    return this.uploadAxios.post("/upload", data);
  }
}

export default new UploadService();
