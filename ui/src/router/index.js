import { createRouter, createWebHistory } from "vue-router";
import generatedRoutes from "virtual:generated-pages";
import { setupLayouts } from "virtual:generated-layouts";
import { isLiveToken } from "../services/utils";
import config from "../config";

// https://github.com/JohnCampionJr/vite-plugin-vue-layouts
const routes = setupLayouts(generatedRoutes);
console.log("routes", routes);
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

const token = ref(useLocalStorage("token", ""));

// Authentication and Authorization navigation guard
router.beforeEach((to, _from) => {
  console.log("to", to.path);
  console.log("from", _from.path);
  // routeRequiresAuth is false only when requiresAuth is explicitly set to a falsy value
  const routeRequiresAuth = !(
    Object.hasOwn(to.meta, "requiresAuth") && !to.meta.requiresAuth
  );
  const isRoleRestrictedRoute = Object.hasOwn(to.meta, "requiresRole");

  let isLoggedIn = false;
  if (isLiveToken(token.value)) {
    isLoggedIn = true;
  } else {
    // JWT expired, remove user from local storage
    token.value = "";
  }

  if (routeRequiresAuth) {
    if (isLoggedIn) {
      if (isRoleRestrictedRoute) {
        console.log("do role check");
      }
    } else {
      // route requires auth and user is not logged in
      // redirect to auth page with requested route path as query parameter
      return {
        name: "auth",
        query: {
          redirect_to: to.path,
        },
      };
    }
  } else {
    // route does not require auth
    if (isLoggedIn && to.name === "auth") {
      // if logged in and navigating to auth, redirect to dashboard
      return "/";
    }
  }
});

// set title based on route record meta properties after navigation
// https://github.com/vuejs/vue-router/issues/914#issuecomment-1019253370
router.afterEach((to, _from) => {
  nextTick(() => {
    document.title = to.meta?.title || config.appTitle;
  });
});

export default router;
