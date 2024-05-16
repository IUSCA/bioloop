import UploadApi from "@/services/uploadApi";
import api from "@/services/api";

class UploadService {
  constructor(token) {
    this.uploadApi = new UploadApi(token);
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

  getUploadToken({ data }) {
    return api.post("/upload/token", data);
  }
}

export default UploadService;
