import api from "./api";
import uploadApi from "./uploadApi";

class UploadService {
  getToken(fileName) {
    return api.get(`/uploads/token/${fileName}`);
  }

  uploadFileChunk(data) {
    return uploadApi.post("/file-chunk", data);
  }
}

export default new UploadService();
