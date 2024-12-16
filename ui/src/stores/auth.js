import config from "@/config";
import authService from "@/services/auth";
import uploadTokenService from "@/services/upload/token";
import { jwtDecode } from "jwt-decode";
import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const env = ref("");
  const user = ref(useLocalStorage("user", {}));
  const token = ref(useLocalStorage("token", ""));
  const uploadToken = ref(useLocalStorage("uploadToken", ""));
  const loggedIn = ref(false);
  const status = ref("");
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

  function casLogin({ ticket }) {
    return authService
      .casVerify(ticket)
      .then((res) => {
        if (res.data) onLogin(res.data);
        return res.data;
      })
      .catch((error) => {
        console.error("CAS Login failed", error);
        status.value = error;
        onLogout();
        return Promise.reject();
      });
  }

  function googleLogin({ code, state }) {
    return authService
      .googleVerify({ code, state })
      .then((res) => {
        if (res.data) onLogin(res.data);
        return res.data;
      })
      .catch((error) => {
        console.error("Google Login failed", error);
        status.value = error;
        onLogout();
        return Promise.reject();
      });
  }

  function ciLogin({ code }) {
    return authService
      .ciVerify({ code })
      .then((res) => {
        if (res.data) onLogin(res.data);
        return res.data;
      })
      .catch((error) => {
        console.error("CI Login failed", error);
        status.value = error;
        onLogout();
        return Promise.reject();
      });
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

  return {
    user,
    loggedIn,
    status,
    initialize,
    casLogin,
    logout,
    hasRole,
    saveSettings,
    spoof,
    canOperate,
    canAdmin,
    setTheme,
    getTheme,
    googleLogin,
    ciLogin,
    env,
    setEnv,
    refreshUploadToken,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
