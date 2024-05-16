import UploadApi from "@/services/uploadApi";

class UploadService {
  constructor(token) {
    console.log("uploadService token");
    console.log(token);
    this.axios = new UploadApi(token).axiosInstance;
    console.log("this.uploadApi.token");
    console.log(this.axios.token);
  }

  test() {
    return this.axios.get("/upload/test");
  }

  // postTest() {
  //   return uploadApi.post("/upload/test");
  // }

  uploadFile(data) {
    return this.axios.post("/upload", data);
  }
}

export default UploadService;
