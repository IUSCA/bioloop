import uploadApi from "@/services/uploadApi";

class UploadService {
  uploadFile(data) {
    return uploadApi.post("/upload", data);
  }
}

export default new UploadService();
