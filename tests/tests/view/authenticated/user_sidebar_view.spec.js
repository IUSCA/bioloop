const { test, expect } = require('@playwright/test');

test('user visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('sidebar-projects')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-management')).not.toBeVisible();
});
