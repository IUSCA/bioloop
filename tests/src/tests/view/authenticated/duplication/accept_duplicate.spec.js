/**
 * Tests for the Accept Duplicate flow on the duplication report page.
 *
 * Covers:
 * - Accept modal opens when the "Accept Duplicate" button is clicked
 * - Confirm button is disabled until the operator types the original dataset name
 * - Typing the wrong name keeps the confirm button disabled
 * - Typing the exact original dataset name enables the confirm button
 * - Successful accept: the page shows the "resolved / accepted" alert
 * - Successful accept: the overwritten original shows the "overwritten" danger alert
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair } = require('../../../../api/duplication');

test.describe.serial('Accept duplicate flow', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
  });

  // -------------------------------------------------------------------------
  // Modal open / close
  // -------------------------------------------------------------------------
  test('Accept modal is not visible before clicking the button', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-modal')).not.toBeVisible();
  });

  test('clicking "Accept Duplicate" opens the accept modal', async ({ page }) => {
    await page.getByTestId('accept-duplicate-btn').click();
    await expect(page.getByTestId('accept-duplicate-modal')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Confirm button guard
  // -------------------------------------------------------------------------
  test('confirm button is disabled when the name input is empty', async ({ page }) => {
    await page.getByTestId('accept-duplicate-btn').click();
    await expect(page.getByTestId('accept-confirm-btn')).toBeDisabled();
  });

  test('confirm button stays disabled when a wrong name is typed', async ({ page }) => {
    await page.getByTestId('accept-duplicate-btn').click();
    await expect(page.getByTestId('accept-duplicate-modal')).toBeVisible();
    await page.getByTestId('accept-name-input').fill('definitely_wrong_name');
    await expect(page.getByTestId('accept-confirm-btn')).toBeDisabled();
  });

  test('confirm button becomes enabled when the exact original dataset name is typed', async ({ page }) => {
    await page.getByTestId('accept-duplicate-btn').click();
    await expect(page.getByTestId('accept-duplicate-modal')).toBeVisible();
    await page.getByTestId('accept-name-input').fill(pair.original.name);
    await expect(page.getByTestId('accept-confirm-btn')).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Successful accept
  // -------------------------------------------------------------------------
  test.describe.serial('after successful accept', () => {
    // This sub-describe runs a fresh pair so the accept here doesn't interfere
    // with the modal-guard tests above (which use the shared pair).
    let acceptPair;

    test.beforeAll(async () => {
      const token = await getTokenByRole({ role: 'operator' });
      acceptPair = await setupDuplicatePair({ token });
    });

    test('page shows the "resolved / accepted" alert after confirming accept', async ({ page }) => {
      await page.goto(`/datasets/${acceptPair.duplicate.id}/duplication`);

      await page.getByTestId('accept-duplicate-btn').click();
      await expect(page.getByTestId('accept-duplicate-modal')).toBeVisible();
      await page.getByTestId('accept-name-input').fill(acceptPair.original.name);
      await page.getByTestId('accept-confirm-btn').click();

      await expect(page.getByTestId('duplication-resolved')).toBeVisible();
      await expect(page.getByTestId('duplication-resolved')).toContainText('accepted');
    });

    test('accept and reject buttons disappear after the duplicate is accepted', async ({ page }) => {
      await page.goto(`/datasets/${acceptPair.duplicate.id}/duplication`);
      await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
      await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();
    });

    test('original dataset page shows the "overwritten" danger alert after accept', async ({ page }) => {
      await page.goto(`/datasets/${acceptPair.original.id}`);
      await expect(page.getByTestId('duplication-alert-overwritten')).toBeVisible();
    });
  });
});
