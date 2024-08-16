import config from "@/config";
import axios from "axios";

class UploadApi {
  constructor() {
    // console.log("uploadApi constructor token");
    // console.log(token);
    // this.token = token;
    this.axiosInstance = axios.create({
      baseURL: config.uploadBasePath,
    });

    // this.setInterceptors();
  }

  setToken(token) {
    // console.log("uploadApi setToken")
    // console.log(token)

    this.token = token
    this.setInterceptors()
  }

  setInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // const _token = uploadToken.value;
        // console.log("uploadApi.interceptors.request.use");
        // console.log("uploadToken.value");
        // console.dir(uploadToken.value, { depth: null });
        // console.log("uploadApi setInterceptor() token");
        // console.dir(_token, { depth: null });
        // console.log(this.token);

        // console.log("typeof _this.token");
        // console.log(typeof this.token);

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

  // getAxiosInstance() {
  //   return this.uploadApi;
  // }
}

export default UploadApi;

// const uploadToken = ref(useLocalStorage("uploadToken", ""));
// const _token = uploadToken.value;
// // const _token = localStorage.getItem("uploadToken");
//
// const uploadApi = axios.create({
//   baseURL: config.uploadBasePath,
// });
//
// uploadApi.interceptors.request.use(
//   (config) => {
//     // const _token = uploadToken.value;
//     // console.log("uploadApi.interceptors.request.use");
//     // console.log("uploadToken.value");
//     // console.dir(uploadToken.value, { depth: null });
//     console.log("_token");
//     // console.dir(_token, { depth: null });
//     console.log(_token);
//
//     console.log("typeof _token");
//     console.log(typeof _token);
//
//     if (_token) {
//       console.log("uploadApi.interceptors.request.use");
//       console.log("setting Authorization header");
//       config.headers.Authorization = `Bearer ${_token}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   },
// );
//
// // If API call has failed because of 401 Unauthorized
// uploadApi.interceptors.response.use(
//   (res) => res,
//   (err) => {
//     if (err.response && err.response.status === 401) {
//       console.error("Error: Unauthorized", err);
//     }
//     return Promise.reject(err);
//   },
// );

// export default uploadApi;
