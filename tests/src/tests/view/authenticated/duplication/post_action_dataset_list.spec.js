/**
 * Tests that the /rawdata dataset list correctly reflects the soft-delete
 * state after a duplicate is accepted or rejected.
 *
 * The API filters out is_deleted=true datasets by default, so:
 *  - After REJECT:  rejected duplicate disappears from the list; original remains.
 *  - After ACCEPT:  soft-deleted original disappears from the list; accepted
 *                   duplicate (renamed to original's name) remains.
 *
 * Both scenarios set up and resolve the duplicate entirely via API helpers so
 * this spec focuses purely on list-page visibility, not the accept/reject flows.
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair, acceptDuplicate, rejectDuplicate } = require('../../../../api/duplication');

const SEARCH_DEBOUNCE_MS = 600;

/**
 * Types a name into the dataset list search input and waits for the debounce.
 */
async function searchDatasetList(page, name) {
  await page.getByTestId('dataset-list-search').fill(name);
  // Allow the debounce + network round-trip.
  await page.waitForTimeout(SEARCH_DEBOUNCE_MS);
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// After REJECT
// ---------------------------------------------------------------------------
test.describe.serial('After reject: dataset list visibility', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
    await rejectDuplicate({ token, datasetId: pair.duplicate.id });
  });

  test('rejected duplicate does NOT appear in the Raw Data list', async ({ page }) => {
    await page.goto('/rawdata');
    await searchDatasetList(page, pair.duplicate.name);
    await expect(
      page.getByTestId(`dataset-list-link-${pair.duplicate.id}`),
    ).not.toBeVisible();
  });

  test('original dataset STILL appears in the Raw Data list after rejection', async ({ page }) => {
    await page.goto('/rawdata');
    await searchDatasetList(page, pair.original.name);
    await expect(
      page.getByTestId(`dataset-list-link-${pair.original.id}`),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// After ACCEPT
// ---------------------------------------------------------------------------
test.describe.serial('After accept: dataset list visibility', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
    await acceptDuplicate({ token, datasetId: pair.duplicate.id });
    // After accept: pair.duplicate is renamed to pair.original.name; pair.original is soft-deleted.
  });

  test('soft-deleted original does NOT appear in the Raw Data list after accept', async ({ page }) => {
    // Both datasets shared the original name before accept; after accept, only
    // the accepted duplicate carries that name and its own ID.
    await page.goto('/rawdata');
    await searchDatasetList(page, pair.original.name);
    await expect(
      page.getByTestId(`dataset-list-link-${pair.original.id}`),
    ).not.toBeVisible();
  });

  test('accepted duplicate APPEARS in the Raw Data list after accept', async ({ page }) => {
    // The accepted duplicate now carries the original's name.
    await page.goto('/rawdata');
    await searchDatasetList(page, pair.original.name);
    await expect(
      page.getByTestId(`dataset-list-link-${pair.duplicate.id}`),
    ).toBeVisible();
  });
});
