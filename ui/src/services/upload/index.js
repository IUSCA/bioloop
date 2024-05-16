import UploadApi from "@/services/uploadApi";

class UploadService {
  constructor(token) {
    console.log("uploadService token");
    console.log(token);
    this.uploadApi = new UploadApi(token);
    console.log("this.uploadApi.token");
    console.log(this.uploadApi.token);
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
