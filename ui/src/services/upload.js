import uploadApi from "@/services/uploadApi";

class UploadService {
  test() {
    return uploadApi.get("/upload/test");
  }

  uploadFile(data) {
    return uploadApi.post("/upload", data);
  }

  getUploadToken(data) {
    return uploadApi.post("/upload/token", data);
  }
}

export default new UploadService();
