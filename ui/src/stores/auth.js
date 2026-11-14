import config from "@/config";
import constants from "@/constants";
import authService from "@/services/auth";
import { useAuthSession } from "@/services/authSession";
import * as utils from "@/services/utils";
import { useNotificationStore } from "@/stores/notification";
import { jwtDecode } from "jwt-decode";
import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, onScopeDispose, ref, watch } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const env = ref("");
  const session = useAuthSession();
  const { user, token, isSpoofing } = session;
  const loggedIn = computed(() => Boolean(token.value));
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
    refreshTokenBeforeExpiry();
  }

  function onLogin(data, { spoof = false } = {}) {
    session.saveSession(data, { spoof });
    useNotificationStore().resetSession();
  }

  function onLogout() {
    session.clearSession();
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
    const wasSpoofing = isSpoofing.value;
    onLogout();
    if (wasSpoofing) window.location.href = "/";
  }

  function refreshTokenBeforeExpiry() {
    clearTimeout(refreshTokenTimer);
    refreshTokenTimer = null;
    if (!token.value) return;

    try {
      const payload = jwtDecode(token.value);
      const expiresAt = new Date(payload.exp * 1000);
      const now = new Date();
      if (now < expiresAt) {
        const delay =
          expiresAt - now - config.refreshTokenTMinusSeconds.appToken * 1000;
        refreshTokenTimer = setTimeout(refreshToken, Math.max(0, delay));
      }
    } catch (err) {
      console.error("Errored trying to decode access token", err);
    }
  }

  function refreshToken() {
    refreshTokenTimer = null;
    const requestSession = session.getSessionSnapshot();
    authService
      .refreshToken(requestSession)
      .then((res) => {
        if (res.data && session.isCurrentSession(requestSession)) {
          onLogin(res.data, { spoof: requestSession.spoof });
        }
      })
      .catch((err) => {
        console.error("Unable to refresh token", err);
      });
  }

  // Shared login changes and tab-local spoof changes each select a new timer.
  watch([token, isSpoofing], refreshTokenBeforeExpiry, { flush: "sync" });
  onScopeDispose(() => clearTimeout(refreshTokenTimer));

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
    const requestSession = session.getSessionSnapshot();
    return authService.spoof(username, requestSession).then((res) => {
      if (!session.isCurrentSession(requestSession)) return;
      const data = res?.data;
      if (
        typeof data?.profile?.username !== "string" ||
        !data.profile.username.trim() ||
        !Array.isArray(data.profile.roles) ||
        data.profile.roles.some((role) => typeof role !== "string") ||
        typeof data?.token !== "string" ||
        !data.token.trim()
      ) {
        throw new Error("Invalid response from Log in as");
      }
      onLogin(data, { spoof: true });
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
    isSpoofing,
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
