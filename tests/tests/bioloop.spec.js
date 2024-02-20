// @ts-check
const { test, expect } = require('@playwright/test');

test('loads', async ({ page }) => {
  await page.goto('http://localhost');

  await page.getByRole('button').click();



  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle('BIOLOOP');
});


