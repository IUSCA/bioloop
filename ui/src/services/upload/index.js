import UploadApi from "@/services/uploadApi";

class UploadService {
  constructor(token) {
    this.uploadApi = new UploadApi(token);
  }

  test() {
    return this.uploadApi.get("/upload/test");
  }

  // postTest() {
  //   return uploadApi.post("/upload/test");
  // }

  uploadFile(data) {
    return this.uploadApi.post("/upload", data);
  }
}

export default UploadService;
