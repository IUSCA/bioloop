import appConfig from "@/config";
import axios from "axios";

// const token = ref(useLocalStorage("globusAccessToken", ""));

const axiosInstance = axios.create({
  baseURL: appConfig.globus.token_url,
});

axiosInstance.interceptors.request.use(
  (config) => {
    const base64EncodedClientCredentials = btoa(
      `${appConfig.globus.client_id}:${appConfig.globus.client_secret}`,
    );
    if (base64EncodedClientCredentials) {
      config.headers.Authorization = `Basic ${base64EncodedClientCredentials}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (res) => {
    const response = res;
    response.headers["Access-Control-Allow-Origin"] = "*";
    return response;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default axiosInstance;
