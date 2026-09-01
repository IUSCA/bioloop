/**
 * Verifies that roles without dataset import access see the disabled-feature
 * warning instead of the import stepper.
 */
import { test, expect } from '@playwright/test';
import config from 'config';
import { FEATURE_ROLE_SYNC_NOTE } from '../../../../constants';

// Roles with import access, as configured for the test environment.
// This must mirror the runtime UI feature config's enabledForRoles list.
// If these diverge, see FEATURE_ROLE_SYNC_NOTE (tests/src/constants.js) for
// the full sync requirement and how to fix it.
const importEnabledForRoles = config.enabledFeatures?.import?.enabledForRoles ?? [];

test.describe('Dataset Import access control', () => {
  test('should show a disabled-feature warning for roles without import access', {
    tag: '@smoke',
  }, async ({ page }) => {
    expect(
      importEnabledForRoles.length,
      `Import feature has no enabled roles.\n\n${FEATURE_ROLE_SYNC_NOTE}`,
    ).toBeGreaterThan(0);

    await page.goto('/datasets/import');

    await expect(page).toHaveURL('/datasets/import');

    // Roles without import access see the feature-disabled alert instead of the stepper.
    // Explicit timeout covers the auth-store resolution delay on first load.
    await expect(
      page.locator('.va-alert').filter({ hasText: 'This feature is currently disabled' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
