import { acceptHMRUpdate, defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { ref } from "vue";
import AuthService from "../services/auth.service";

export const useAuthStore = defineStore("auth", () => {
  const user = ref(useLocalStorage("user", {}));
  const loggedIn = ref(false);
  const status = ref("");

  function initialize() {
    if (user.value.accessToken) {
      AuthService.verify()
        .then(() => {
          status.value = JSON.stringify(user);
          loggedIn.value = true;
        })
        .catch(onLogout);
    }
  }

  function onLogin(_user) {
    user.value = _user;
    loggedIn.value = true;
  }

  function onLogout() {
    loggedIn.value = false;
    user.value = {};
  }

  function login(casTicket, casReturn) {
    return AuthService.login(casTicket, casReturn).then(
      (_user) => {
        onLogin(_user);
      },
      (error) => {
        status.value = error;
        onLogout();
        return Promise.reject(error);
      }
    );
  }

  function logout() {
    onLogout();
  }

  function register(casTicket, casReturn) {
    return AuthService.register(casTicket, casReturn)
      .then((_user) => {
        onLogin(_user);
      })
      .catch((error) => {
        status.value = error;
        onLogout();
        return Promise.reject(error);
      });
  }

  // Check for roles
  function hasRole(role) {
    return "roles" in user.value && user.value.roles.includes(role);
  }

  function saveSettings(data) {
    return AuthService.saveSettings(data).then(
      (res) => (user.value.settings = res.data.settings)
    );
  }

  return {
    user,
    loggedIn,
    status,
    initialize,
    login,
    logout,
    register,
    hasRole,
    saveSettings,
  };
});

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
