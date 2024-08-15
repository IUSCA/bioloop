import UploadApi from "@/services/uploadApi";

class UploadService {
  constructor() {
    // console.log("uploadService token");
    // console.log(token);
    this.uploadApi = new UploadApi()
    // this.uploadApi.setToken(token)
    this.axios = this.uploadApi.axiosInstance;
    // console.log("this.uploadApi.token");
    // console.log(this.uploadApi.token);
  }

  setToken(token) {
    console.log("uploadService setToken")
    console.log(token)
    this.uploadApi.setToken(token)
  }

  // test() {
  //   return this.axios.get("/upload/test");
  // }

  // postTest() {
  //   return uploadApi.post("/upload/test");
  // }

  uploadFile(data) {
    return this.axios.post("/upload", data);
  }
}

export default UploadService;
