import axios from "axios";
import config from "../config";

const token = ref(useLocalStorage("token", ""));

const axiosInstance = axios.create({
  baseURL: config.apiBasePath,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const _token = token.value;
    if (_token) {
      config.headers.Authorization = `Bearer ${_token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// axiosInstance.interceptors.response.use(
//   (res) => res,
//   (err) => {
//     console.log("intercept", err);
//   }
// );

export default axiosInstance;
