import axios from "axios";
import config from "@/config";
import router from "@/router";

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

// If API call has failed because of 401 Unauthorized
// navigate to logout page
axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.log("Error: Unauthorized", err);

      // logout
      router.push("/auth/logout");
    }
    return Promise.reject(err);
  }
);

export default axiosInstance;
