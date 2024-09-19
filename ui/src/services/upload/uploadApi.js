import config from "@/config";
import axios from "axios";

class UploadApi {
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.uploadApiBasePath,
    });
  }

  setToken(token) {
    this.token = token;
    this.setInterceptors();
  }

  setInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    this.axiosInstance.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response && err.response.status === 401) {
          console.error("Error: Unauthorized", err);
        }
        return Promise.reject(err);
      },
    );
  }
}

export default UploadApi;
