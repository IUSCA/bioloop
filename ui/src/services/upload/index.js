import api from "../api";
import UploadApi from "./uploadApi";

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
    limit = null,
    offset = null,
  } = {}) {
    return api.get(`/uploads`, {
      params: {
        status,
        upload_type,
        entity_name,
        offset,
        limit,
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

  processUpload(upload_log_id, upload_type) {
    return api.post(`/uploads/${upload_log_id}/process`, null, {
      params: { upload_type: upload_type },
    });
  }

  uploadFile(data) {
    return this.uploadAxios.post("/upload", data);
  }
}

export default new UploadService();
