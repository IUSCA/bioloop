import { acceptHMRUpdate, defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { ref } from "vue";
import authService from "../services/auth";

export const useAuthStore = defineStore("auth", () => {
  const user = ref(useLocalStorage("user", {}));
  const loggedIn = ref(false);
  const status = ref("");

  function onLogin(_user) {
    user.value = _user;
    loggedIn.value = true;
  }

  function onLogout() {
    loggedIn.value = false;
    user.value = {};
  }

  function casLogin(ticket) {
    return authService
      .casVerify(ticket)
      .then((res) => {
        const _user = res.data;
        if (_user) onLogin(_user);
        return _user;
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

  function register() {}

  // Check for roles
  function hasRole(role) {
    return "roles" in user.value && user.value.roles.includes(role);
  }

  function saveSettings(data) {
    return authService
      .saveSettings(data)
      .then((res) => (user.value.settings = res.data.settings));
  }

  return {
    user,
    loggedIn,
    status,
    casLogin,
    logout,
    register,
    hasRole,
    saveSettings,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
