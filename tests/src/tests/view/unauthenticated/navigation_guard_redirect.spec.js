const { test, expect } = require('@playwright/test');

async function gotoWithRetry(page, targetPath) {
  try {
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!String(error).includes('ERR_ABORTED')) {
      throw error;
    }
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  }
}

test('all protected views redirect to login with redirect_to query', async ({ page }) => {
  const protectedViews = ['/projects', '/stats', '/workflows'];

  for (const viewPath of protectedViews) {
    const targetPath = `${viewPath}?from=e2e_nav_guard`;
    await gotoWithRetry(page, targetPath);

    await expect(page.getByTestId('login-button')).toBeVisible();

    const redirectedUrl = new URL(page.url());
    expect(redirectedUrl.pathname).toBe('/auth');
    expect(redirectedUrl.searchParams.get('redirect_to')).toBe(targetPath);
  }
});

test('about page is public', async ({ page }) => {
  await gotoWithRetry(page, '/about');

  await expect(page).toHaveURL(/\/about$/, { timeout: 15000 });
});
