import api from "../api";

class DatasetUploadService {
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

  updateDatasetUploadLog(dataset_id, data) {
    return api.patch(`/datasetUploads/${dataset_id}`, data);
  }

  processDatasetUpload(dataset_id) {
    return api.post(`/datasetUploads/${dataset_id}/process`);
  }

  cancelDatasetUpload(dataset_id) {
    return api.post(`/datasetUploads/${dataset_id}/cancel`);
  }
}

export default new DatasetUploadService();
