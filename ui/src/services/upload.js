import uploadApi from "@/services/uploadApi";

class UploadService {
  test() {
    return uploadApi.get("/upload/test");
  }

  uploadFile(data) {
    return uploadApi.post("/upload", data);
  }
}

export default new UploadService();
