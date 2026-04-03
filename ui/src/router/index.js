import config from "@/config";
import { isLiveToken, setIntersection } from "@/services/utils";
import { setupLayouts } from "virtual:generated-layouts";
import { createRouter, createWebHistory } from "vue-router";
import { routes } from "vue-router/auto-routes";

/**
 * Vue Router does not propagate the `props: true` option from parent routes to child routes,
 * and each "leaf route" (i.e. a route without children) is responsible for defining its own
 * `props` configuration. Without explicitly applying `props: true` to each leaf route, dynamic
 * route parameters (e.g., `datasetId` in route `/datasets/:datasetId`) will not be passed
 * automatically as props to the associated Vue component.
 *
 * This function ensures that `props: true` is applied to all leaf routes, thus ensuring that
 * route params are properly injected into components as props across the entire routing structure,
 * including deeply nested or dynamically generated routes.
 */
function applyPropsToLeafRoutes(routes) {
  return routes.map((route) => {
    if (route.children && route.children.length > 0) {
      // Recursively handle child routes
      route.children = applyPropsToLeafRoutes(route.children);
    } else {
      // Apply `props: true` to leaf route
      route.props = true;
    }
    return route;
  });
}

const generatedRoutes = setupLayouts(applyPropsToLeafRoutes(routes));

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: generatedRoutes,
});

// =======================================================
// E2E Router Exposure
// =======================================================
// #region E2E Router Exposure
//
// Expose the router for e2e tests only when explicitly opted-in via env.
// Never attach in production builds so a mis-set flag cannot ship in
// `vite build` output.
const exposeRouterForTests =
  typeof window !== "undefined" &&
  import.meta.env.VITE_EXPOSE_ROUTER_FOR_E2E === "1" &&
  import.meta.env.MODE !== "production";

if (exposeRouterForTests && !window.__BIOLOOP_E2E_ROUTER__) {
  window.__BIOLOOP_E2E_ROUTER__ = router;
}
// #endregion E2E Router Exposure

const token = ref(useLocalStorage("token", ""));
const user = ref(useLocalStorage("user", {}));

function auth_guard(to, _from) {
  // console.log("to", to.path);
  // console.log("from", _from.path);
  // routeRequiresAuth is false only when requiresAuth is explicitly set to a
  // falsy value
  const routeRequiresAuth = !(
    Object.hasOwn(to.meta, "requiresAuth") && !to.meta.requiresAuth
  );
  const isRoleRestrictedRoute = Object.hasOwn(to.meta, "requiresRoles");

  let isLoggedIn = false;
  if (isLiveToken(token.value)) {
    isLoggedIn = true;
  } else {
    // JWT expired, remove user from local storage
    token.value = "";
  }

  if (routeRequiresAuth) {
    if (isLoggedIn) {
      // route requires auth and user is logged in
      if (isRoleRestrictedRoute) {
        // route has role restrictions
        const common_roles = setIntersection(
          new Set(to.meta.requiresRoles),
          new Set(user.value.roles),
        );
        if (common_roles.size === 0) {
          // user does not have required role to access route
          // continue route from where user came from
          return false;
        }
      }
    } else {
      // route requires auth and user is not logged in
      // redirect to auth page with requested route path and query params as
      // query parameter
      return {
        name: "/auth/",
        query: {
          redirect_to: to.fullPath, // preserves the full path including query params
        },
      };
    }
  } else {
    // route does not require auth
    if (isLoggedIn && to.name === "/auth/") {
      // if logged in and navigating to auth, redirect to dashboard
      return "/";
    }
  }
}

// Authentication and Authorization navigation guard
router.beforeEach(auth_guard);

// set title based on route record meta properties after navigation
// https://github.com/vuejs/vue-router/issues/914#issuecomment-1019253370
router.afterEach((to, _from) => {
  nextTick(() => {
    // set page title as <title> | appTitle if meta.title is set
    // otherwise set page title as appTitle
    document.title = to.meta?.title
      ? `${to.meta.title} | ${config.appTitle}`
      : config.appTitle;
  });
});

export default router;
