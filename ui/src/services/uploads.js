import api from "./api";
// import uploadApi from "./uploadApi";

class UploadService {
  getToken(filename) {
    return api.post(`/uploads/token/`, { file_name: filename });
  }

  // refreshToken(filename) {
  //   return api.post(`/uploads/refresh_token/`, { filename });
  // }

  uploadFileChunk(data) {
    return api.post("/file-chunk", data);
  }
}

export default new UploadService();
