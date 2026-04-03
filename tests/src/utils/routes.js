/**
 * Converts a route definition path with params into a stable concrete path
 * that tests can navigate to.
 *
 * Dynamic segments are replaced with deterministic placeholders:
 * - `:projectId` -> `e2e-project-id`
 * - `:datasetId` -> `e2e-dataset-id`
 * - catch-all params (`:all(.*)*`) -> `e2e-any`
 * - other params -> `e2e-param`
 *
 * @param {string} routePath - Router path pattern from Vue Router.
 * @returns {string} Concrete path usable in test navigation.
 *
 * @example
 * materializeRoutePath('/projects/:projectId/datasets/:datasetId');
 * // => '/projects/e2e-project-id/datasets/e2e-dataset-id'
 *
 * @example
 * materializeRoutePath('/files/:all(.*)*');
 * // => '/files/e2e-any'
 */
function materializeRoutePath(routePath) {
  return routePath
    .replace(/:projectId/g, 'e2e-project-id')
    .replace(/:datasetId/g, 'e2e-dataset-id')
    .replace(/:([^/()]+)\(\.\*\)\*/g, 'e2e-any')
    .replace(/:([^/]+)/g, 'e2e-param');
}

/**
 * Normalizes raw router records into a deduplicated, sorted view inventory.
 *
 * Rules:
 * - deduplicates by raw route path;
 * - infers `requiresAuth=true` unless route explicitly sets
 *   `meta.requiresAuth=false`; - keeps `requiresRoles` only when route metadata
 *   provides an array;
 * - drops catch-all fallback routes.
 *
 * @param {{path?: string, meta?: Record<string, any>}[]} records - Raw `router.getRoutes()` records.
 * @returns {{routePath: string, concretePath: string, title: string|null, requiresAuth: boolean, requiresRoles: string[]}[]}
 * Normalized route metadata for test assertions.
 *
 * @example
 * normalizeRouteRecords([
 *   { path: '/about', meta: { requiresAuth: false, title: 'About' } },
 *   { path: '/projects/:projectId', meta: { requiresRoles: ['admin'] } },
 * ]);
 * // => [
 * //   {
 * //     routePath: '/about',
 * //     concretePath: '/about',
 * //     title: 'About',
 * //     requiresAuth: false,
 * //     requiresRoles: [],
 * //   },
 * //   {
 * //     routePath: '/projects/:projectId',
 * //     concretePath: '/projects/e2e-project-id',
 * //     title: null,
 * //     requiresAuth: true,
 * //     requiresRoles: ['admin'],
 * //   },
 * // ]
 */
function normalizeRouteRecords(records) {
  const dedup = new Map();
  records.forEach((record) => {
    const path = record.path || '';
    if (!path || dedup.has(path)) return;
    const requiresAuth = !(
      Object.prototype.hasOwnProperty.call(record.meta || {}, 'requiresAuth')
      && !record.meta.requiresAuth
    );
    const requiresRoles = Array.isArray(record.meta?.requiresRoles)
      ? record.meta.requiresRoles
      : [];
    dedup.set(path, {
      routePath: path,
      concretePath: materializeRoutePath(path),
      title: record.meta?.title || null,
      requiresAuth,
      requiresRoles,
    });
  });
  return [...dedup.values()]
    .filter((entry) => entry.routePath !== '/:all(.*)*' && entry.routePath !== '/:all(.*)')
    .sort((a, b) => a.routePath.localeCompare(b.routePath));
}

/**
 * Reads router route records from the running app and returns normalized view
 * metadata for E2E route-based assertions.
 *
 * Uses `window.__BIOLOOP_E2E_ROUTER__` when the UI was built/started with
 * `VITE_EXPOSE_ROUTER_FOR_E2E=1` and a non-production Vite mode (see
 * `ui/src/router/index.js`). If router is unavailable, returns an empty list.
 *
 * @param {import('@playwright/test').Page} page - Playwright page instance.
 * @returns {Promise<{routePath: string, concretePath: string, title: string|null, requiresAuth: boolean, requiresRoles: string[]}[]>}
 * Promise resolving to normalized app views.
 *
 * @example
 * const views = await getAppViews(page);
 * // views[0]
 * // => { routePath: '/about', concretePath: '/about', requiresAuth: false, ... }
 */
async function getAppViews(page) {
  const records = await page.evaluate(() => {
    const router = window.__BIOLOOP_E2E_ROUTER__;
    if (!router || typeof router.getRoutes !== 'function') return [];
    return router.getRoutes().map((route) => ({
      path: route.path,
      meta: route.meta || {},
    }));
  });
  return normalizeRouteRecords(records);
}

/**
 * Returns only routes that require authentication.
 *
 * @param {import('@playwright/test').Page} page - Playwright page instance.
 * @returns {Promise<{routePath: string, concretePath: string, title: string|null, requiresAuth: boolean, requiresRoles: string[]}[]>}
 * Auth-protected views.
 *
 * @example
 * const protectedViews = await getProtectedViews(page);
 * // protectedViews.every((v) => v.requiresAuth) === true
 */
async function getProtectedViews(page) {
  const views = await getAppViews(page);
  return views.filter((view) => view.requiresAuth);
}

/**
 * Returns routes explicitly marked public (`meta.requiresAuth === false`),
 * matching `auth_guard` treatment of unauthenticated navigation.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object[]>} Same row shape as {@link getAppViews}.
 */
async function getPublicViews(page) {
  const views = await getAppViews(page);
  return views.filter((view) => !view.requiresAuth);
}

/**
 * Returns auth-required routes that the given role is not authorized to access.
 *
 * A route is considered unauthorized for `role` when:
 * - it requires auth,
 * - `requiresRoles` exists and is non-empty,
 * - and role is not included in `requiresRoles`.
 *
 * @param {import('@playwright/test').Page} page - Playwright page instance.
 * @param {'admin'|'operator'|'user'} role - Active role under test.
 * @returns {Promise<{routePath: string, concretePath: string, title: string|null, requiresAuth: boolean, requiresRoles: string[]}[]>}
 * Views expected to show role-authorization denial.
 *
 * @example
 * const deniedForUser = await getUnauthorizedViewsForRole(page, 'user');
 * // deniedForUser might include '/users' when route requires ['admin', 'operator']
 */
async function getUnauthorizedViewsForRole(page, role) {
  const views = await getAppViews(page);
  return views.filter((view) => (
    view.requiresAuth
    && Array.isArray(view.requiresRoles)
    && view.requiresRoles.length > 0
    && !view.requiresRoles.includes(role)
  ));
}

module.exports = {
  getAppViews,
  getProtectedViews,
  getPublicViews,
  getUnauthorizedViewsForRole,
};
