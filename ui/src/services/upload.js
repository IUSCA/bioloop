import uploadApi from "@/services/uploadApi";
import api from "@/services/api";

class UploadService {
  test() {
    return uploadApi.get("/upload/test");
  }

  uploadFile(data) {
    return uploadApi.post("/upload", data);
  }

  getUploadToken(data) {
    return api.post("/upload/token", data);
  }
}

export default new UploadService();
