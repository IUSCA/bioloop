import config from "@/config";
import axios from "axios";

const uploadToken = ref(useLocalStorage("uploadToken", ""));

const uploadApi = axios.create({
  baseURL: config.uploadBasePath,
});

uploadApi.interceptors.request.use(
  (config) => {
    const _token = uploadToken.value;
    console.log("uploadApi.interceptors.request.use");
    console.log("uploadToken.value");
    console.log(uploadToken.value);
    console.log("token");
    console.log(_token);

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
