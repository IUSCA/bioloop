import config from "@/config";
import constants from "@/constants";
import authService from "@/services/auth";
import toast from "@/services/toast";
import * as utils from "@/services/utils";
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
  // sessionStorage, not localStorage: an invitation belongs to the tab the recipient opened
  // the link in. It has to survive the OAuth redirect out and back, and it must not leak into
  // another tab where somebody else may be signed in.
  const inviteToken = ref(useSessionStorage("invite_token", ""));
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
    // call logout API to clear cookie on backend
    authService
      .logout()
      .catch((err) => {
        console.error("Error calling logout API", err);
      })
      .finally(() => {
        loggedIn.value = false;
        user.value = {};
        token.value = "";
      });
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
              // An invitation held from before the redirect is spent now, and cannot fail
              // the login: someone who cannot join the group is still signed in.
              applyHeldInvite();
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

  function clearInviteData() {
    inviteToken.value = "";
  }

  /**
   * Spend a held invitation, if there is one.
   *
   * Called after a successful login, because that is the first moment the server can tell
   * whether the account that just signed in is the one the invitation was for.
   *
   * The token is cleared only on a definitive answer. 403, 404 and 409 all mean this link
   * will never work for this account — wrong address, already spent or expired, group
   * archived — so holding it would only produce the same message on every future login. Any
   * other failure is the network or the server, and the token stays so the person can retry
   * within this tab session.
   */
  async function applyHeldInvite() {
    if (!inviteToken.value) return;
    try {
      const { data } = await authService.applyInvite(inviteToken.value);
      toast.success(`You've been added to ${data.group_name}`);
      clearInviteData();
    } catch (err) {
      const status = err?.response?.status;
      if ([403, 404, 409].includes(status)) {
        toast.error(
          status === 403
            ? "That invitation was sent to a different email address."
            : "That invitation is no longer valid.",
        );
        clearInviteData();
      } else {
        console.error("Could not apply the invitation", err);
        toast.error(
          "Could not join the group. Open the invitation link again to retry.",
        );
      }
    }
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
    inviteToken,
    clearInviteData,
    applyHeldInvite,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
