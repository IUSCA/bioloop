import api from "./api";
import uploadApi from "./uploadApi";

class UploadService {
  getToken() {
    return api.get(`/uploads/token`);
  }

  uploadFileChunk(data) {
    return uploadApi.post("/file-chunk", data);
  }
}

export default new UploadService();
