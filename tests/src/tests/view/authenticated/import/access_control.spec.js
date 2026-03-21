import { test, expect } from '@playwright/test';

test.describe('Dataset Import access control', () => {
  test('should show a disabled-feature warning for roles without import access', async ({ page }) => {
    await page.goto('/datasets/import');

    await expect(page).toHaveURL('/datasets/import');

    // Non-admin roles see the feature-disabled alert instead of the stepper.
    // Explicit timeout covers the auth-store resolution delay on first load.
    await expect(
      page.locator('.va-alert').filter({ hasText: 'This feature is currently disabled' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
