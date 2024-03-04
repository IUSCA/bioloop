// @ts-check
const { chromium, test, expect } = require('@playwright/test');

test('loads', async ({ page }) => {
  await page.goto('https://localhost');

  // Expect a title "to contain" a substring.
  await expect(page.getByRole('button')).toHaveText('Login with Indiana University');

  await page.getByText('Login with Indiana University').click();

  await expect(page.getByText('e2eUser')).toBeVisible();
});
//

