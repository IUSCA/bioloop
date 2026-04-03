const { test, expect } = require('@playwright/test');

test.describe('Projects page (user role)', () => {
  test('user cannot see create-project button and operator-only columns', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Create Project/i })).toHaveCount(0);
    await expect(page.locator('th', { hasText: /^users$/i })).toHaveCount(0);
    await expect(page.locator('th', { hasText: /^actions$/i })).toHaveCount(0);
  });
});
