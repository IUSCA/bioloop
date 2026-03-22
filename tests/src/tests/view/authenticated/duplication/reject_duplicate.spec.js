/**
 * Tests for the Reject Duplicate flow on the duplication report page.
 *
 * Covers:
 * - Reject modal opens when the "Reject Duplicate" button is clicked
 * - Confirm button is disabled until the operator types the duplicate dataset name
 * - Typing the wrong name keeps the confirm button disabled
 * - Typing the exact duplicate dataset name enables the confirm button
 * - Successful reject: the page shows the "resolved / rejected" alert
 * - Rejected duplicate's detail page shows the "rejected duplicate" danger alert
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair } = require('../../../../api/duplication');

test.describe.serial('Reject duplicate flow', () => {
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
  test('Reject modal is not visible before clicking the button', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-modal')).not.toBeVisible();
  });

  test('clicking "Reject Duplicate" opens the reject modal', async ({ page }) => {
    await page.getByTestId('reject-duplicate-btn').click();
    await expect(page.getByTestId('reject-duplicate-modal')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Confirm button guard
  // -------------------------------------------------------------------------
  test('confirm button is disabled when the name input is empty', async ({ page }) => {
    await page.getByTestId('reject-duplicate-btn').click();
    await expect(page.getByTestId('reject-confirm-btn')).toBeDisabled();
  });

  test('confirm button stays disabled when a wrong name is typed', async ({ page }) => {
    await page.getByTestId('reject-duplicate-btn').click();
    await expect(page.getByTestId('reject-duplicate-modal')).toBeVisible();
    await page.getByTestId('reject-name-input').fill('definitely_wrong_name');
    await expect(page.getByTestId('reject-confirm-btn')).toBeDisabled();
  });

  test('confirm button becomes enabled when the exact duplicate dataset name is typed', async ({ page }) => {
    await page.getByTestId('reject-duplicate-btn').click();
    await expect(page.getByTestId('reject-duplicate-modal')).toBeVisible();
    await page.getByTestId('reject-name-input').fill(pair.duplicate.name);
    await expect(page.getByTestId('reject-confirm-btn')).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Successful reject
  // -------------------------------------------------------------------------
  test.describe.serial('after successful reject', () => {
    let rejectPair;

    test.beforeAll(async () => {
      const token = await getTokenByRole({ role: 'operator' });
      rejectPair = await setupDuplicatePair({ token });
    });

    test('page shows the "resolved / rejected" alert after confirming reject', async ({ page }) => {
      await page.goto(`/datasets/${rejectPair.duplicate.id}/duplication`);

      await page.getByTestId('reject-duplicate-btn').click();
      await expect(page.getByTestId('reject-duplicate-modal')).toBeVisible();
      await page.getByTestId('reject-name-input').fill(rejectPair.duplicate.name);
      await page.getByTestId('reject-confirm-btn').click();

      await expect(page.getByTestId('duplication-resolved')).toBeVisible();
      await expect(page.getByTestId('duplication-resolved')).toContainText('rejected');
    });

    test('accept and reject buttons disappear after the duplicate is rejected', async ({ page }) => {
      await page.goto(`/datasets/${rejectPair.duplicate.id}/duplication`);
      await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
      await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();
    });

    test('rejected duplicate detail page shows the "rejected duplicate" danger alert', async ({ page }) => {
      await page.goto(`/datasets/${rejectPair.duplicate.id}`);
      await expect(page.getByTestId('duplication-alert-rejected-duplicate')).toBeVisible();
    });

    test('original dataset page does NOT show a "duplicated by" alert after rejection', async ({ page }) => {
      // After rejection, the duplicate is soft-deleted and filtered out.
      await page.goto(`/datasets/${rejectPair.original.id}`);
      await expect(
        page.getByTestId(`duplicated-by-alert-${rejectPair.duplicate.id}`),
      ).not.toBeVisible();
    });
  });
});
