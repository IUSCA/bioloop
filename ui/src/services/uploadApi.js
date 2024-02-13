import axios from "axios";
import config from "@/config";

const token = ref(useLocalStorage("uploadToken", ""));

const uploadApi = axios.create({
  baseURL: config.uploadPath,
});

uploadApi.interceptors.request.use(
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
uploadApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.error("Error: Unauthorized", err);
    }
    return Promise.reject(err);
  },
);

export default uploadApi;
