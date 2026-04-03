const { test, expect } = require('@playwright/test');
const { gotoWithRetry } = require('../../../actions/navigation');
const { getProtectedViews, getPublicViews } = require('../../../utils/routes');

/** @param {string} pathname */
function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/$/, '');
  return trimmed === '' ? '/' : trimmed;
}

test.describe('unauthenticated navigation guard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithRetry(page, '/about');
  });

  /**
   * Every route the router treats as auth-required must redirect to `/auth` and
   * preserve the attempted URL (including query) in `redirect_to`.
   *
   * Paths come from `window.__BIOLOOP_E2E_ROUTER__` when the UI runs with
   * `VITE_EXPOSE_ROUTER_FOR_E2E=1` and non-production Vite mode.
   */
  test('all protected views redirect to login with redirect_to query', async ({ page }) => {
    test.setTimeout(300000);

    const protectedViews = await getProtectedViews(page);
    test.skip(
      protectedViews.length === 0,
      'Router not on window: set VITE_EXPOSE_ROUTER_FOR_E2E=1 on the UI (see docker-compose-e2e ui service) and use a non-production Vite dev server.',
    );

    for (const { concretePath } of protectedViews) {
      const targetPath = `${concretePath}?from=e2e_nav_guard`;
      await gotoWithRetry(page, targetPath);

      await expect(page.getByTestId('login-button')).toBeVisible();

      const redirectedUrl = new URL(page.url());
      expect(redirectedUrl.pathname).toBe('/auth');
      expect(redirectedUrl.searchParams.get('redirect_to')).toBe(targetPath);
    }
  });

  /**
   * Every route explicitly public (`meta.requiresAuth: false`) must load without
   * the auth redirect that adds `redirect_to` (same source as protected list).
   */
  test('all public views load without auth redirect_to', async ({ page }) => {
    test.setTimeout(120000);

    const publicViews = await getPublicViews(page);
    test.skip(
      publicViews.length === 0,
      'Router not on window: set VITE_EXPOSE_ROUTER_FOR_E2E=1 on the UI (see docker-compose-e2e ui service) and use a non-production Vite dev server.',
    );

    for (const { concretePath } of publicViews) {
      await gotoWithRetry(page, concretePath);

      const url = new URL(page.url());
      expect(url.searchParams.has('redirect_to')).toBe(false);
      expect(normalizePathname(url.pathname)).toBe(normalizePathname(concretePath));
    }
  });
});
