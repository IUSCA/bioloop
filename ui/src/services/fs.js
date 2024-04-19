import config from "@/config";
import axios from "axios";

const token = ref(useLocalStorage("fsToken", ""));

const fsApi = axios.create({
  baseURL: config.slateScratchPath,
});

fsApi.interceptors.request.use(
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
fsApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.error("Error: Unauthorized", err);
    }
    return Promise.reject(err);
  },
);

export default fsApi;
