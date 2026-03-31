import config from "@/config";
import constants from "@/constants";
import authService from "@/services/auth";
import * as utils from "@/services/utils";
import { useNotificationStore } from "@/stores/notification";
import { jwtDecode } from "jwt-decode";
import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const env = ref("");
  const user = ref(useLocalStorage("user", {}));
  const token = ref(useLocalStorage("token", ""));
  const loggedIn = ref(false);
  const signupToken = ref(useLocalStorage("signup_token", ""));
  const signupEmail = ref("");
  let refreshTokenTimer = null;
  const safeStorageGet = (storage, key) => {
    try {
      return storage?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  };
  const isUploadAuthDebugEnabled = () => {
    if (
      typeof window !== "undefined" &&
      window.__UPLOAD_AUTH_DEBUG__ === true
    ) {
      return true;
    }
    const sessionValue = safeStorageGet(
      window?.sessionStorage,
      "UPLOAD_AUTH_DEBUG",
    );
    if (sessionValue === "1" || sessionValue === "true") {
      return true;
    }
    const localValue = safeStorageGet(
      window?.localStorage,
      "UPLOAD_AUTH_DEBUG",
    );
    return localValue === "1" || localValue === "true";
  };
  const describeToken = (rawToken) => {
    if (!rawToken) {
      return { present: false, fingerprint: "none", exp_iso: null, ttl_seconds: null };
    }
    const fingerprint = `${rawToken.slice(0, 8)}...${rawToken.slice(-8)}`;
    try {
      const payload = jwtDecode(rawToken);
      const expMs = payload?.exp ? payload.exp * 1000 : null;
      return {
        present: true,
        fingerprint,
        exp_iso: expMs ? new Date(expMs).toISOString() : null,
        ttl_seconds: expMs ? Math.round((expMs - Date.now()) / 1000) : null,
      };
    } catch (err) {
      return {
        present: true,
        fingerprint,
        exp_iso: null,
        ttl_seconds: null,
        decode_error: err?.message,
      };
    }
  };
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
    const before = token.value;
    user.value = data.profile;
    token.value = data.token;
    loggedIn.value = true;
    useNotificationStore().resetSession();
    if (isUploadAuthDebugEnabled()) {
      console.info("[AUTH] onLogin token update", {
        previous: describeToken(before),
        next: describeToken(token.value),
      });
    }
    refreshTokenBeforeExpiry();
  }

  function onLogout() {
    loggedIn.value = false;
    user.value = {};
    token.value = "";
    useNotificationStore().resetSession();
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
          // not an expected response
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
          if (isUploadAuthDebugEnabled()) {
            console.info("[AUTH] refreshTokenBeforeExpiry scheduled", {
              delay_seconds: Math.round(delay / 1000),
              refresh_tminus_seconds: config.refreshTokenTMinusSeconds.appToken,
              token: describeToken(token.value),
            });
          }
          refreshTokenTimer = setTimeout(refreshToken, delay);
        }
        // else - do nothing, navigation guard will redirect to /auth
      } catch (err) {
        console.error("Errored trying to decode access token", err);
      }
    }
  }

  function refreshToken() {
    const tokenBeforeRefresh = token.value;
    refreshTokenTimer = null; // reset timer state
    if (isUploadAuthDebugEnabled()) {
      console.info("[AUTH] refreshToken start", {
        token_before: describeToken(tokenBeforeRefresh),
      });
    }
    authService
      .refreshToken()
      .then((res) => {
        if (res.data) {
          onLogin(res.data);
          if (isUploadAuthDebugEnabled()) {
            console.info("[AUTH] refreshToken success", {
              token_before: describeToken(tokenBeforeRefresh),
              token_after: describeToken(token.value),
            });
          }
        }
      })
      .catch((err) => {
        console.error("Unable to refresh token", err);
        if (isUploadAuthDebugEnabled()) {
          console.error("[AUTH] refreshToken failed", {
            error: err?.message,
            token_before: describeToken(tokenBeforeRefresh),
          });
        }
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

  const isFeatureEnabled = (featureKey) => {
    return utils.isFeatureEnabled({ featureKey, hasRole });
  };

  return {
    user,
    token,
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
