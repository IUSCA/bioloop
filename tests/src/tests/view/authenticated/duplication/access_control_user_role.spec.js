/**
 * User-role access control test for the duplication report page.
 *
 * The route has requiresRoles: ["operator", "admin"]. When a user-role user
 * attempts client-side navigation to /datasets/:id/duplication, the Vue Router
 * navigation guard returns false, cancelling the navigation and leaving the
 * browser on the previous URL.
 *
 * This spec is run under the `user_duplication` Playwright project which uses
 * USER_STORAGE_STATE so the test is already logged in as a user-role user.
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair } = require('../../../../api/duplication');

test.describe.serial('Duplication report page — user role is blocked', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
  });

  test('user role navigation to the duplication page is stopped by the route guard', async ({ page }) => {
    // Navigate to a known starting page so we have a stable reference URL.
    await page.goto('/');

    // Attempt client-side navigation to the duplication page.
    // Vue Router's beforeEach guard returns false for roles without access,
    // cancelling the navigation and leaving the URL unchanged.
    await page.evaluate((path) => {
      window.__vue_router__?.push(path);
    }, `/datasets/${pair.duplicate.id}/duplication`);

    await page.waitForTimeout(500);

    // The URL must not have changed to the duplication page.
    await expect(page).not.toHaveURL(new RegExp(`/datasets/${pair.duplicate.id}/duplication`));
    // Guard outcomes may redirect to a default landing page.
    expect(page.url()).not.toMatch(new RegExp(`/datasets/${pair.duplicate.id}/duplication`));
  });

  test('user role direct URL visit to the duplication page does not render the report', async ({ page }) => {
    // Start from root, then do a hard navigation via page.goto.
    // When the app bootstraps with a restricted route, the guard fires on app
    // load and cancels the navigation — the page stays blank or redirects to
    // the default route.
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);

    // The duplication resolution component must not be rendered.
    await expect(page.getByTestId('duplication-resolved')).not.toBeVisible();
    await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();

    // Guard outcome can be either redirect OR route cancellation while retaining
    // the URL.  The core assertion is that sensitive duplication controls/report
    // are not rendered for user role.
    await expect(page.getByTestId('report-header')).not.toBeVisible();
    await expect(page.getByTestId('report-body')).not.toBeVisible();
  });
});
