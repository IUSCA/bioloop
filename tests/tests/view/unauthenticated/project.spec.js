const {
  chromium, test, expect, request,
} = require('@playwright/test');

test('redirects to navigation guard', async ({ page }) => {
  await page.goto('/projects');

  await expect(page.getByTestId('login-button')).toBeVisible();
});
