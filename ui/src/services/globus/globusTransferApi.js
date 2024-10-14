import appConfig from "@/config";
import axios from "axios";

const accessToken = useLocalStorage("globusAccessToken", "");

const axiosInstance = axios.create({
  baseURL: appConfig.globus.transfer_endpoint_url,
});

axiosInstance.interceptors.request.use(
  (config) => {
    if (accessToken.value) {
      config.headers.Authorization = `Bearer ${accessToken.value}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (res) => {
    return res;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default axiosInstance;
