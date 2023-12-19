import api from "./api";
import axios from "axios";
import config from "@/config";

const token = ref(useLocalStorage("uploadToken", ""));

const uploadAxiosInstance = axios.create({
  baseURL: config.uploadPath,
});

uploadAxiosInstance.interceptors.request.use(
  (config) => {
    const _token = token.value;
    if (_token) {
      config.headers.Authorization = `Bearer ${_token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// If API call has failed because of 401 Unauthorized
uploadAxiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.error("Error: Unauthorized", err);
    }
    return Promise.reject(err);
  },
);

class UploadService {
  getToken() {
    return api.get(`/uploads/token`);
  }

  uploadFileChunk(data) {
    return uploadAxiosInstance.post("/file-chunk", data);
  }
}

export default new UploadService();
