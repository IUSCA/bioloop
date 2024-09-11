import config from "@/config";
import router from "@/router";
import axios from "axios";
import toast from "./toast";

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
  },
);

// If API call has failed because of 401 Unauthorized
// navigate to logout page
axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.error("Error: Unauthorized", err);
      router.push("/auth/logout"); // logout
    }
    return Promise.reject(err);
  },
);

// handle unhandled promise rejections for axios globally
window.addEventListener("unhandledrejection", (event) => {
  if (axios.isAxiosError(event.reason)) {
    const err = event.reason;
    if (err.response) {
      // if status is 4xx show toast called Request Failed
      if (err.response.status >= 400 && err.response.status < 500) {
        console.error("Error: Request Failed", err);
        const reason = err.response.data?.message || err.response.data?.error;
        toast.error("Request Failed" + (reason ? `: ${reason}` : ""));
      }

      // if status if 5xx show toast called Server Error
      else if (err.response.status >= 500) {
        console.error("Error: Server Error", err);
        toast.error("Server Error");
      }
    } else if (err.request) {
      // show offline message for errors of code "ERR_NETWORK"
      if (err.code === "ERR_NETWORK") {
        console.error("Error: Network Error", err);
        toast.error("Network Error");
      } else {
        console.error("The request was made but no response was received", err);
        toast.error("Request Failed");
      }
    } else {
      console.error("Error: Unknown Error", err);
      toast.error("Unknown Error");
    }
    event.preventDefault();
  }
});

export default axiosInstance;
