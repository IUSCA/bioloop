/**
 * Tests that all edit/action controls are hidden or disabled on the dataset
 * detail page when a dataset has been soft-deleted (is_deleted = true).
 *
 * A rejected duplicate is used as the soft-deleted subject: after rejection
 * the duplicate gets is_deleted=true, which is the simplest soft-delete
 * state reachable via the duplication API without running workers.
 *
 * An overwritten original (produced by accepting a duplicate) is used to
 * test the overwritten-original scenario.
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair, rejectDuplicate, acceptDuplicate } = require('../../../../api/duplication');

test.describe.serial('Soft-deleted dataset controls — rejected duplicate', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
    await rejectDuplicate({ token, datasetId: pair.duplicate.id });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}`);
  });

  test('Edit button is not visible for a soft-deleted dataset', async ({ page }) => {
    // AddEditButton has v-if="!dataset.is_deleted" — it should be absent from the DOM
    await expect(page.getByTestId('dataset-edit-btn')).not.toBeVisible();
  });

  test('Browse Files button is disabled for a soft-deleted dataset', async ({ page }) => {
    await expect(page.getByTestId('browse-files-btn')).toBeDisabled();
  });

  test('"rejected duplicate" alert is shown', async ({ page }) => {
    await expect(page.getByTestId('duplication-alert-rejected-duplicate')).toBeVisible();
  });
});

test.describe.serial('Soft-deleted dataset controls — overwritten original', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
    await acceptDuplicate({ token, datasetId: pair.duplicate.id });
  });

  test.beforeEach(async ({ page }) => {
    // The original is now soft-deleted with OVERWRITTEN state
    await page.goto(`/datasets/${pair.original.id}`);
  });

  test('Edit button is not visible for the overwritten original', async ({ page }) => {
    await expect(page.getByTestId('dataset-edit-btn')).not.toBeVisible();
  });

  test('Browse Files button is disabled for the overwritten original', async ({ page }) => {
    await expect(page.getByTestId('browse-files-btn')).toBeDisabled();
  });

  test('"overwritten" alert is shown on the overwritten original', async ({ page }) => {
    await expect(page.getByTestId('duplication-alert-overwritten')).toBeVisible();
  });
});
