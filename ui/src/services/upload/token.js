import api from "@/services/api";

class UploadTokenService {
  getUploadToken({ data }) {
    return api.post("/upload/token", data);
  }
}

export default new UploadTokenService();
