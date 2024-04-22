const {
  chromium, test, expect, request,
} = require('@playwright/test');

test('user visible', async ({ page }) => {
  await page.goto('/');

  // const token = await page.evaluate(() => localStorage.getItem('token'));
  // console.log('user token:');
  // console.log(token);

  await expect(page.getByTestId('sidebar-projects')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-management')).not.toBeVisible();
});
