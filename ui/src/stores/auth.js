import config from "@/config";
import constants from "@/constants";
import authService from "@/services/auth";
import uploadTokenService from "@/services/upload/token";
import * as utils from "@/services/utils";
import { jwtDecode } from "jwt-decode";
import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const env = ref("");
  const user = ref(useLocalStorage("user", {}));
  const token = ref(useLocalStorage("token", ""));
  const uploadToken = ref(useLocalStorage("uploadToken", ""));
  const loggedIn = ref(false);
  const signupToken = ref(useLocalStorage("signup_token", ""));
  const signupEmail = ref("");
  let refreshTokenTimer = null;
  const canOperate = computed(() => {
    return hasRole("operator") || hasRole("admin");
  });
  const canAdmin = computed(() => {
    return hasRole("admin");
  });

  function initialize() {
    if (user.value && token.value) {
      loggedIn.value = true;
      refreshTokenBeforeExpiry();
    }
  }

  function onLogin(data) {
    user.value = data.profile;
    token.value = data.token;
    loggedIn.value = true;
    refreshTokenBeforeExpiry();
  }

  function onLogout() {
    loggedIn.value = false;
    user.value = {};
    token.value = "";
    uploadToken.value = "";
  }

  /**
   * Wraps verify API function to handle the response and errors for oauth2 code verification.
   *
   * @param {Function} apiFn - The API function to be wrapped. It should return a Promise.
   * @returns {Function} A new function that wraps the provided API function and handles its response.
   *
   * The returned function:
   * - Resolves with the status of the verification process if the response is successful.
   * - Handles specific statuses such as `SUCCESS` and `SIGNUP_REQUIRED` by performing actions like
   *   logging in the user or setting the signup email in the store.
   * - Logs out the user and rejects the Promise for unexpected responses or errors.
   * - Handles specific error cases, such as a 401 response with a `NOT_A_USER` status, by resolving
   *   with the error status.
   * - Logs errors and rejects the Promise for all other error cases.
   */
  function withHandledVerifyResponse(apiFn) {
    return (...args) => {
      return apiFn(...args)
        .then((res) => {
          if (res.data) {
            if (
              res.data.status === constants.auth.verify.response.status.SUCCESS
            ) {
              // handle successful login
              onLogin(res.data);
              return res.data.status;
            }
            if (
              res.data.status ===
              constants.auth.verify.response.status.SIGNUP_REQUIRED
            ) {
              // set token in local storage
              signupToken.value = res.data.signup_token;
              // set email in store
              signupEmail.value = res.data.email;
              return res.data.status;
            }
            if (
              res.data.status ===
              constants.auth.verify.response.status.NOT_A_USER
            ) {
              return res.data.status;
            }
          }
          // not an expcected response
          console.error("Unexpected response from the verify API", res);
          onLogout();
          return Promise.reject();
        })
        .catch((error) => {
          // handle all other errors as is
          console.error("Login failed", error);
          onLogout();
          return Promise.reject();
        });
    };
  }

  function clearSignupData() {
    signupToken.value = "";
    signupEmail.value = "";
  }

  function logout() {
    onLogout();
  }

  function refreshTokenBeforeExpiry() {
    // idempotent method - will not create a timeout if one already exists
    if (!refreshTokenTimer) {
      // timer is not running running
      try {
        const payload = jwtDecode(token.value);
        const expiresAt = new Date(payload.exp * 1000);
        const now = new Date();
        if (now < expiresAt) {
          // token is still alive
          const delay =
            expiresAt - now - config.refreshTokenTMinusSeconds.appToken * 1000;
          console.log(
            "auth store: refreshTokenBeforeExpiry: trigerring refreshToken in ",
            delay / 1000,
            "seconds",
          );
          refreshTokenTimer = setTimeout(refreshToken, delay);
        }
        // else - do nothing, navigation guard will redirect to /auth
      } catch (err) {
        console.error("Errored trying to decode access token", err);
      }
    }
  }

  function refreshToken() {
    refreshTokenTimer = null; // reset timer state
    authService
      .refreshToken()
      .then((res) => {
        if (res.data) onLogin(res.data);
      })
      .catch((err) => {
        console.error("Unable to refresh token", err);
      });
  }

  // Check for roles
  function hasRole(role) {
    return (
      "roles" in user.value &&
      user.value.roles.map((s) => s.toLowerCase()).includes(role.toLowerCase())
    );
  }

  function saveSettings(data) {
    return authService
      .saveSettings(data)
      .then((res) => (user.value.settings = res.data.settings));
  }

  function spoof(username) {
    return authService.spoof(username).then((res) => {
      onLogin(res.data);
      // reload entire app to reload all components
      window.location.href = "/";
    });
  }

  const setEnv = (val) => {
    env.value = val;
  };

  const setTheme = (theme) => {
    user.value.theme = theme;
  };

  const getTheme = () => user.value.theme;

  const refreshUploadToken = async ({ fileName, refreshToken = false }) => {
    const payload = uploadToken.value ? jwtDecode(uploadToken.value) : null;
    const expiresAt = payload ? new Date(payload.exp * 1000) : null;
    const now = new Date();

    let willRefreshUploadToken = refreshToken;
    // If client has not explicitly requested for the token to be refreshed,
    // check if the token is about to expire. If so, refresh the token.
    if (!willRefreshUploadToken) {
      if (now < expiresAt) {
        const uploadTokenExpiresInSeconds = (expiresAt - now) / 1000;
        willRefreshUploadToken =
          uploadTokenExpiresInSeconds <
          config.refreshTokenTMinusSeconds.uploadToken;
      } else {
        willRefreshUploadToken = true;
      }
    }
    return new Promise((resolve, reject) => {
      if (willRefreshUploadToken) {
        uploadTokenService
          .getUploadToken({ data: { file_name: fileName } })
          .then((res) => {
            uploadToken.value = res.data.accessToken;
            resolve();
          })
          .catch((err) => {
            console.error(err);
            reject(err);
          });
      } else {
        resolve();
      }
    });
  };

  const isFeatureEnabled = (featureKey) => {
    return utils.isFeatureEnabled({ featureKey, hasRole });
  };

  return {
    user,
    loggedIn,
    initialize,
    logout,
    hasRole,
    saveSettings,
    spoof,
    canOperate,
    canAdmin,
    setTheme,
    getTheme,
    env,
    setEnv,
    refreshUploadToken,
    isFeatureEnabled,
    withHandledVerifyResponse,
    signupEmail,
    signupToken,
    clearSignupData,
    onLogin,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
