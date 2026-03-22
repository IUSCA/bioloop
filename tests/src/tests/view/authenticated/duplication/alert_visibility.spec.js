/**
 * Tests that duplication-related alerts on the dataset detail page appear for
 * the correct roles and in the correct dataset states.
 *
 * Setup: two independent dataset pairs are created via API before the tests
 * run — no workers are needed.
 *
 * Pair A (pendingAlertPair): original + duplicate in DUPLICATE_READY.
 *   Used to verify the "pending action" alert and the "duplicated by" alert.
 *
 * Pair B (rejectedAlertPair): original + duplicate that is then rejected.
 *   Used to verify the "rejected duplicate" alert.
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair, rejectDuplicate } = require('../../../../api/duplication');

test.describe.serial('Duplication alert visibility', () => {
  let pendingAlertPair;
  let rejectedAlertPair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });

    // Pair A: pending duplicate (DUPLICATE_READY)
    pendingAlertPair = await setupDuplicatePair({ token });

    // Pair B: duplicate that has already been rejected
    rejectedAlertPair = await setupDuplicatePair({ token });
    await rejectDuplicate({ token, datasetId: rejectedAlertPair.duplicate.id });
  });

  // -------------------------------------------------------------------------
  // Pending duplicate — the duplicate's own detail page
  // -------------------------------------------------------------------------
  test.describe('Pending duplicate — duplicate dataset page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/datasets/${pendingAlertPair.duplicate.id}`);
    });

    test('shows the "pending action" warning alert', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-pending')).toBeVisible();
    });

    test('pending alert contains the original dataset name', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-pending')).toContainText(
        pendingAlertPair.original.name,
      );
    });

    test('shows the Accept/Reject button inside the pending alert', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-accept-reject-btn')).toBeVisible();
    });

    test('Accept/Reject button navigates to the duplication report page', async ({ page }) => {
      await page.getByTestId('duplication-alert-accept-reject-btn').click();
      await expect(page).toHaveURL(`/datasets/${pendingAlertPair.duplicate.id}/duplication`);
    });
  });

  // -------------------------------------------------------------------------
  // Original dataset with an active incoming duplicate
  // -------------------------------------------------------------------------
  test.describe('Original dataset with incoming duplicate', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/datasets/${pendingAlertPair.original.id}`);
    });

    test('shows the "duplicated by" warning alert', async ({ page }) => {
      await expect(
        page.getByTestId(`duplicated-by-alert-${pendingAlertPair.duplicate.id}`),
      ).toBeVisible();
    });

    test('"duplicated by" alert contains the duplicate dataset name', async ({ page }) => {
      await expect(
        page.getByTestId(`duplicated-by-alert-${pendingAlertPair.duplicate.id}`),
      ).toContainText(pendingAlertPair.duplicate.name);
    });

    test('shows the Accept/Reject button inside the "duplicated by" alert', async ({ page }) => {
      await expect(
        page.getByTestId(`duplicated-by-accept-reject-btn-${pendingAlertPair.duplicate.id}`),
      ).toBeVisible();
    });

    test('"duplicated by" Accept/Reject button navigates to the duplicate report page', async ({ page }) => {
      await page.getByTestId(`duplicated-by-accept-reject-btn-${pendingAlertPair.duplicate.id}`).click();
      await expect(page).toHaveURL(`/datasets/${pendingAlertPair.duplicate.id}/duplication`);
    });
  });

  // -------------------------------------------------------------------------
  // Rejected duplicate
  // -------------------------------------------------------------------------
  test.describe('Rejected duplicate dataset page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/datasets/${rejectedAlertPair.duplicate.id}`);
    });

    test('shows the "rejected duplicate" danger alert', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-rejected-duplicate')).toBeVisible();
    });

    test('"rejected duplicate" alert contains the original dataset name', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-rejected-duplicate')).toContainText(
        rejectedAlertPair.original.name,
      );
    });

    test('does NOT show the "pending action" alert for a rejected duplicate', async ({ page }) => {
      await expect(page.getByTestId('duplication-alert-pending')).not.toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // Overwritten original: the original in rejectedAlertPair is NOT overwritten;
  // use a fresh accept pair when that test is written (see accept_duplicate.spec.js).
  // The overwritten alert is asserted there.
  // -------------------------------------------------------------------------
});
