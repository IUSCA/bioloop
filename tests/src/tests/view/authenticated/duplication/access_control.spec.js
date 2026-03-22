/**
 * Access control tests for the duplication report page (/datasets/:id/duplication).
 *
 * The route has requiresRoles: ["operator", "admin"], so the navigation guard
 * returns false (stops navigation) when a user-role user attempts to reach it.
 *
 * These tests verify:
 * - Operator can access the duplication report page
 * - User role is blocked from navigating to the duplication report page
 *   (see access_control_user_role.spec.js for the user-role half)
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair } = require('../../../../api/duplication');

test.describe.serial('Duplication report page — operator access', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
  });

  test('operator can access the duplication report page', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    // The feature-disabled alert must NOT appear for an authorized operator.
    await expect(
      page.getByTestId('duplication-feature-disabled-alert'),
    ).not.toBeVisible();
    // The URL should remain on the duplication page (no redirect away).
    await expect(page).toHaveURL(new RegExp(`/datasets/${pair.duplicate.id}/duplication`));
  });
});
