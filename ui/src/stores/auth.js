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
  const fsToken = ref(useLocalStorage("fsToken", ""));
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

        console.log("expiresAt");
        console.log(expiresAt);

        const now = new Date();
        console.log("now");
        console.log(now);

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

  function refreshUploadTokenBeforeExpiry(fileName) {
    // idempotent method - will not create a timeout if one already exists
    console.log("refreshUploadTokenBeforeExpiry");

    if (!refreshUploadTokenTimer) {
      console.log("if (!refreshUploadTokenTimer)");
      // timer is not running
      try {
        console.log("uploadToken.value");
        console.dir(uploadToken.value, { depth: null });
        const payload = jwtDecode(uploadToken.value);
        // console.log("payload");
        // console.dir(payload, { depth: null });

        const expiresAt = new Date(payload.exp * 1000);
        // console.log("expiresAt")
        // console.log(expiresAt)

        const now = new Date();
        // console.log("now")
        // console.log(now)

        if (now < expiresAt) {
          // token is still alive
          // console.log("if (now < expiresAt)")
          const delay =
            expiresAt -
            now -
            config.refreshTokenTMinusSeconds.uploadToken * 1000;
          console.log("delay: ", delay);
          console.log(
            "auth store: refreshUploadTokenBeforeExpiry: triggering refreshToken in ",
            delay / 1000,
            "seconds",
          );
          refreshUploadTokenTimer = setInterval(() => {
            // console.log("setInterval called");
            console.log("refresh upload token, setInterval running");
            console.log("---");
            refreshUploadToken(fileName);
          }, delay);
        }
        // else - do nothing, navigation guard will redirect to /auth
      } catch (err) {
        console.error("Errored trying to decode upload token", err);
        console.log("---");
      }
    }
  }

  function refreshToken() {
    console.log("refreshToken()");
    refreshTokenTimer = null; // reset timer state
    authService
      .refreshToken()
      .then((res) => {
        console.log("auth store: refreshToken: received new token");
        console.lot("new token: ", res.data.token);
        if (res.data) onLogin(res.data);
      })
      .catch((err) => {
        console.log("Unable to refresh token", err);
      });
  }

  function refreshUploadToken(fileName) {
    console.log("refreshUploadToken() " + fileName);

    // const now = new Date();
    // console.log("now");
    // console.log(now);

    refreshUploadTokenTimer = null; // reset upload timer state
    // console.log("fileName");
    // console.log(fileName);

    uploadTokenService
      .getUploadToken({ data: { file_name: fileName } })
      .then((res) => {
        console.log(
          "auth store: refreshUploadToken: received new upload token",
        );
        console.log("then, new token:");
        console.log(res.data.accessToken);
        uploadToken.value = res.data.accessToken;
        console.log("---");
      })
      .catch((err) => {
        console.error("Unable to refresh upload token", err);
        console.log("---");
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

  const onFileUpload = async (fileName) => {
    // const uploadService = new UploadService(uploadToken.value);
    console.log("onFileUpload");
    console.log("filename");
    console.log(fileName);

    return uploadTokenService
      .getUploadToken({ data: { file_name: fileName } })
      .then((res) => {
        console.log("got initial token");
        console.log(res.data.accessToken);
        uploadToken.value = res.data.accessToken;
        console.log("then");
        console.log("uploadToken.value");
        console.log(uploadToken.value);
        console.log("---");
        refreshUploadTokenBeforeExpiry(fileName);
      })

      .catch((err) => {
        console.error("Unable to get refresh token");
        console.error("Unable to refresh upload token", err);

        console.log("catch");
        console.log("uploadToken.value");
        console.log(uploadToken.value);
        console.log("---");
      });
  };

  const postFileUpload = () => {
    // const uploadService = new UploadService(uploadToken.value);
    console.log("postFileUpload");
    // console.log("filename")
    // console.log(fileName)
    console.log("clearInterval called");
    clearInterval(refreshUploadTokenTimer);
    console.log("refreshUploadTokenTimer");
    console.log(refreshUploadTokenTimer);
    console.log("---");
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
    onFileUpload,
    postFileUpload,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
