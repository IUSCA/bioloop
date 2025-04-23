import api from "../api";

class DatasetUploadService {
  getDatasetUploadLogs({
    forSelf = true,
    status = null,
    dataset_name = null,
    limit = null,
    offset = null,
    username = null,
  } = {}) {
    const path = forSelf
      ? `/datasetUploads/${username}/all`
      : `/datasetUploads/all`;
    return api.get(path, {
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
