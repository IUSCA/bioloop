import axios from "axios";
import config from "../config";

const user = ref(useLocalStorage("user", {}));

const axiosInstance = axios.create({
  baseURL: config.apiBasePath,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = user.value?.token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
