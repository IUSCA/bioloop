function materializeRoutePath(routePath) {
  return routePath
    .replace(/:projectId/g, 'e2e-project-id')
    .replace(/:datasetId/g, 'e2e-dataset-id')
    .replace(/:([^/()]+)\(\.\*\)\*/g, 'e2e-any')
    .replace(/:([^/]+)/g, 'e2e-param');
}

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

async function getAppViews(page) {
  const records = await page.evaluate(() => {
    const router = window.__BIOLOOP_ROUTER__;
    if (!router || typeof router.getRoutes !== 'function') return [];
    return router.getRoutes().map((route) => ({
      path: route.path,
      meta: route.meta || {},
    }));
  });
  return normalizeRouteRecords(records);
}

async function getProtectedViews(page) {
  const views = await getAppViews(page);
  return views.filter((view) => view.requiresAuth);
}

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
  getUnauthorizedViewsForRole,
};
