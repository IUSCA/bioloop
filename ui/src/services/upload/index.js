import UploadApi from "./uploadApi";

class UploadService {
  constructor() {
    this.uploadApi = new UploadApi();
    this.uploadAxios = this.uploadApi.axiosInstance;
  }

  setToken(token) {
    this.uploadApi.setToken(token);
  }

  uploadFile(data) {
    console.log("uploading file", data.get("name"));
    return this.uploadAxios.post("/upload", data);
    // return Promise.resolve("uploaded");
  }
}

export default new UploadService();
