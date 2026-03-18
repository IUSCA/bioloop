import { test, expect } from '@playwright/test';
import config from 'config';
import { FEATURE_ROLE_SYNC_NOTE } from '../../../constants';

// Which roles have access to the import feature, per the test environment config.
// This must mirror the runtime UI feature config's enabledForRoles list.
// If these diverge, see FEATURE_ROLE_SYNC_NOTE (tests/src/constants.js) for
// the full sync requirement and how to fix it.
const importEnabledForRoles = config.enabledFeatures?.import?.enabledForRoles ?? [];

test.describe('Dataset Import access control', () => {
  test('should show a disabled-feature warning for roles without import access', async ({ page }) => {
    // If no role has access the test environment config is misconfigured.
    test.skip(
      importEnabledForRoles.length === 0,
      `Import feature has no enabled roles in the test config.\n\n${FEATURE_ROLE_SYNC_NOTE}`,
    );

    await page.goto('/datasets/import');

    await expect(page).toHaveURL('/datasets/import');

    // Non-admin roles see the feature-disabled alert instead of the stepper.
    // Explicit timeout covers the auth-store resolution delay on first load.
    await expect(
      page.locator('.va-alert').filter({ hasText: 'This feature is currently disabled' }),
    ).toBeVisible({ timeout: 15000 });
  });
});
