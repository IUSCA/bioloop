import api from "@/services/api";

class UploadTokenService {
  getUploadToken({ data }) {
    return api.post("/uploads/token", data);
  }
}

export default new UploadTokenService();
