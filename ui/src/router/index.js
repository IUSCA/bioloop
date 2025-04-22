import config from "@/config";
import { isLiveToken, setIntersection } from "@/services/utils";
import { setupLayouts } from "virtual:generated-layouts";
// import generatedRoutes from "virtual:generated-pages";
import { createRouter, createWebHistory } from "vue-router";
import { routes, handleHotUpdate } from "vue-router/auto-routes";

// console.log("generatedRoutes", generatedRoutes);
// console.log("routes", routes);
// const generatedRoutes = setupLayouts(routes);
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

console.log("generatedRoutes", generatedRoutes);

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
  routes: generatedRoutes,
  // routes,
});

const token = ref(useLocalStorage("token", ""));
const user = ref(useLocalStorage("user", {}));

function auth_guard(to, _from) {
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
      if (isRoleRestrictedRoute) {
        const required_roles = to.meta.requiresRoles;
        const user_roles = user.value?.roles || [];

        const common_roles = [
          ...setIntersection(new Set(required_roles), new Set(user_roles)),
        ];
        // console.log({
        //   required_roles,
        //   user_roles,
        //   common_roles,
        // });

        if (common_roles.length == 0) {
          // does not have at least one required role
          // stop navigation
          return false;
        }
      }
    } else {
      // route requires auth and user is not logged in
      // redirect to auth page with requested route path as query parameter
      return {
        name: "/auth/",
        query: {
          redirect_to: to.path,
        },
      };
    }
  } else {
    console.log("route does not require auth");
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
