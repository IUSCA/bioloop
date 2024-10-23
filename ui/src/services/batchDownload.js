import api from "./api";



class batchDownloadService {
  intiate_download( id ) {
    return api.get(`/batch_download/${id}`).catch((err) => {
      console.error(err);
      return Promise.reject(err);
    });
  }
}

export default new batchDownloadService();