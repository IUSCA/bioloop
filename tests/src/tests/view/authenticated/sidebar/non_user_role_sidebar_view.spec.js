const { test, expect } = require('@playwright/test');

test('sidebar items visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('sidebar-projects')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-management')).toBeVisible();
});
