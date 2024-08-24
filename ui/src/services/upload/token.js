import api from "@/services/api";

class UploadTokenService {
  getUploadToken({ data }) {
    console.log("uploadTokenService.getUploadToken Called");
    console.log("---");

    return api.post("/upload/token", data);
  }
}

export default new UploadTokenService();
