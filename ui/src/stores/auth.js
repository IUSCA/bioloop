import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { jwtDecode } from "jwt-decode";
import authService from "@/services/auth";
import config from "@/config";
import uploadService from "@/services/uploads";

export const useAuthStore = defineStore("auth", () => {
  const user = ref(useLocalStorage("user", {}));
  const token = ref(useLocalStorage("token", ""));
  const uploadTokens = ref(useLocalStorage("uploadTokens", {}));
  const loggedIn = ref(false);
  const status = ref("");
  let refreshTokenTimer = null;
  let refreshUploadTokenTimer = null;

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

  async function onUpload(fileName) {
    const tokenResponse = await uploadService.getToken(fileName);
    uploadTokens.value = tokenResponse.data.accessToken;

    refreshUploadTokenBeforeExpiry();
  }

  function refreshUploadTokenBeforeExpiry() {
    // idempotent method - will not create a timeout if one already exists
    if (!refreshUploadTokenTimer) {
      // timer is not running
      try {
        const payload = jwtDecode(uploadTokens.value);
        const expiresAt = new Date(payload.exp * 1000);
        const now = new Date();
        if (now < expiresAt) {
          // token is still alive
          const delay =
            expiresAt - now - config.refreshTMinusSeconds.uploadToken * 1000;
          console.log(
            "auth store: refreshUploadTokenBeforeExpiry: trigerring refreshToken in ",
            delay / 1000,
            "seconds",
          );
          refreshUploadTokenTimer = setTimeout(refreshToken, delay);
        }
        // else - do nothing, navigation guard will redirect to /auth
      } catch (err) {
        console.error("Errored trying to decode access token", err);
      }
    }
  }

  function onLogout() {
    loggedIn.value = false;
    user.value = {};
    token.value = "";
  }

  function casLogin(ticket) {
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
            expiresAt - now - config.refreshTMinusSeconds.token * 1000;
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
    console.log("refreshing token");
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

  function refreshUploadToken() {
    console.log("refreshing upload token");
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

  const setTheme = (theme) => {
    user.value.theme = theme;
  };

  const getTheme = () => user.value.theme;

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
    setUploadToken,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
