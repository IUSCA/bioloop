const { test, expect } = require('@playwright/test');
const { getAppViews, getUnauthorizedViewsForRole } = require('../../../../utils/routes');
const {
  inferRoleFromProjectName,
  getSidebarExpectationsForRole,
} = require('../../../../utils/sidebar');

test.describe('sidebar (admin/operator roles)', () => {
  test('shows expected sidebar visibility for non-user role', async ({ page }, testInfo) => {
    const role = inferRoleFromProjectName(testInfo.project.name);
    const expectations = getSidebarExpectationsForRole(role);
    await page.goto('/');

    for (const testId of expectations.visibleTestIds) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    for (const testId of expectations.hiddenTestIds) {
      await expect(page.getByTestId(testId)).not.toBeVisible();
    }
  });

  test('can visit each visible sidebar route and see basic page UI', async ({ page }, testInfo) => {
    const role = inferRoleFromProjectName(testInfo.project.name);
    const expectations = getSidebarExpectationsForRole(role);
    const appViews = await getAppViews(page);
    const titleByRoute = new Map(appViews.map((view) => [view.routePath, view.title]));

    for (const routePath of expectations.navigableRoutes) {
      await page.goto(routePath);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('role-authorization-alert')).not.toBeVisible();
      await expect(page).toHaveURL(new RegExp(`^.*${routePath.replace(/\//g, '\\/')}`));
      const expectedTitle = titleByRoute.get(routePath);
      if (expectedTitle) {
        await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'));
      }
    }
  });

  test('blocks navigation when visiting restricted views by URL', async ({ page }, testInfo) => {
    const role = inferRoleFromProjectName(testInfo.project.name);
    const unauthorizedViews = await getUnauthorizedViewsForRole(page, role);
    await page.goto('/');
    const originalPath = new URL(page.url()).pathname;

    for (const view of unauthorizedViews) {
      const routePath = `${view.concretePath}?from=sidebar_unauthorized`;
      await page.goto(routePath);
      await page.waitForLoadState('domcontentloaded');
      const currentPath = new URL(page.url()).pathname;
      expect(currentPath).toBe(originalPath);
    }
  });
});
