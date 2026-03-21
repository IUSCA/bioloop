const { test, expect } = require('@playwright/test');

const PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';

test('deep link redirects to login with redirect_to query', async ({ page }) => {
  await page.goto(`/projects/${PROJECT_ID}`);

  await expect(page.getByTestId('login-button')).toBeVisible();

  const redirectedUrl = new URL(page.url());
  expect(redirectedUrl.pathname).toBe('/auth');
  expect(redirectedUrl.searchParams.get('redirect_to')).toBe(
    `/projects/${PROJECT_ID}`,
  );
});

test('about page is public', async ({ page }) => {
  await page.goto('/about');

  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.locator('#main').getByText('About', { exact: true }),
  ).toBeVisible();
});
