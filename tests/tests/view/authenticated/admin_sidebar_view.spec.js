const {
  chromium, test, expect, request,
} = require('@playwright/test');

test('admin visible', async ({ page }) => {
  await page.goto('/');

  // const token = await page.evaluate(() => localStorage.getItem('token'));
  // console.log('admin token:');
  // console.log(token);

  await expect(page.getByTestId('sidebar-projects')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-management')).toBeVisible();
});
