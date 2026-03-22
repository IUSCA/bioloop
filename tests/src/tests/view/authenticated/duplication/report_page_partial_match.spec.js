/**
 * Tests for the duplication report page when datasets only partially match.
 *
 * Uses a 50% Jaccard match (2 common / 4 denominator) to verify:
 * - The summary header renders the correct score and formula values
 * - Check sections display the custom labels provided by the comparison worker
 * - Check sections with passed=false are still rendered alongside passing ones
 *
 * Note: file_checks arrays are empty (no actual dataset_file records are
 * required) so "No files in this category." is shown inside each section.
 * The focus here is the summary-level data, section presence, and label text.
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePairWithPartialMatch } = require('../../../../api/duplication');

test.describe.serial('Duplication report page — partial match (Jaccard 50%)', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    // jaccard=0.5: 2 common / (3 incoming + 3 original − 2 common) = 2/4
    pair = await setupDuplicatePairWithPartialMatch({ token });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
  });

  // -------------------------------------------------------------------------
  // Jaccard score display
  // -------------------------------------------------------------------------
  test('Jaccard score shows 50, not 100', async ({ page }) => {
    await expect(page.getByTestId('jaccard-score')).toBeVisible();
    await expect(page.getByTestId('jaccard-score')).toContainText('50');
  });

  test('Jaccard score does not show 100%', async ({ page }) => {
    await expect(page.getByTestId('jaccard-score')).not.toContainText('100');
  });

  // -------------------------------------------------------------------------
  // Jaccard formula breakdown
  // -------------------------------------------------------------------------
  test('Jaccard formula shows 50%', async ({ page }) => {
    await expect(page.getByTestId('jaccard-formula')).toContainText('50%');
  });

  test('Jaccard formula shows 2 common files', async ({ page }) => {
    // Formula: "50% = 2 / (3 + 3 − 2) = 2/4"
    await expect(page.getByTestId('jaccard-formula')).toContainText('2/4');
  });

  test('Jaccard formula shows the correct denominator', async ({ page }) => {
    // denominator = incoming + original − common = 3 + 3 − 2 = 4
    await expect(page.getByTestId('jaccard-formula')).toContainText('2/4');
  });

  // -------------------------------------------------------------------------
  // Check section titles and labels
  // -------------------------------------------------------------------------
  test('EXACT_CONTENT_MATCHES section shows the hash-based title', async ({ page }) => {
    await expect(page.getByTestId('check-section-EXACT_CONTENT_MATCHES')).toContainText('Exact content matches');
  });

  test('EXACT_CONTENT_MATCHES section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-EXACT_CONTENT_MATCHES')).toContainText('2 of 3 files have matching content');
  });

  test('SAME_PATH_DIFFERENT_CONTENT section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_PATH_DIFFERENT_CONTENT')).toContainText('1 file changed at same path');
  });

  test('SAME_PATH_SAME_CONTENT section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_PATH_SAME_CONTENT')).toContainText('2 files match by path and content');
  });

  test('SAME_CONTENT_DIFFERENT_PATH section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_CONTENT_DIFFERENT_PATH')).toContainText('No moved/renamed same-content files');
  });

  test('ONLY_IN_INCOMING section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_INCOMING')).toContainText('No files only in incoming');
  });

  test('ONLY_IN_ORIGINAL section shows the custom label from the comparison result', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_ORIGINAL')).toContainText('No files only in original');
  });

  // -------------------------------------------------------------------------
  // All four check sections are rendered regardless of passed/failed status
  // -------------------------------------------------------------------------
  test('EXACT_CONTENT_MATCHES section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-EXACT_CONTENT_MATCHES')).toBeVisible();
  });

  test('SAME_PATH_DIFFERENT_CONTENT section is present even when it has failed status', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_PATH_DIFFERENT_CONTENT')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Alert-style icons: warning for failed, checkmark for passed
  // -------------------------------------------------------------------------
  test('SAME_PATH_DIFFERENT_CONTENT section shows a warning icon (passed=false)', async ({ page }) => {
    await expect(page.getByTestId('check-icon-failed-SAME_PATH_DIFFERENT_CONTENT')).toBeVisible();
  });

  test('EXACT_CONTENT_MATCHES section shows a success icon (passed=true)', async ({ page }) => {
    await expect(page.getByTestId('check-icon-passed-EXACT_CONTENT_MATCHES')).toBeVisible();
  });

  test('ONLY_IN_INCOMING section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_INCOMING')).toBeVisible();
  });

  test('ONLY_IN_ORIGINAL section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_ORIGINAL')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Controls — a partial match is still DUPLICATE_READY; buttons should show
  // -------------------------------------------------------------------------
  test('Accept Duplicate button is visible and enabled for a partial match', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('accept-duplicate-btn')).toBeEnabled();
  });

  test('Reject Duplicate button is visible and enabled for a partial match', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Dataset links
  // -------------------------------------------------------------------------
  test('incoming dataset link contains the duplicate dataset name', async ({ page }) => {
    await expect(page.getByTestId('incoming-dataset-link')).toContainText(pair.duplicate.name);
  });

  test('original dataset link contains the original dataset name', async ({ page }) => {
    await expect(page.getByTestId('original-dataset-link')).toContainText(pair.original.name);
  });

  test('clicking the incoming dataset link navigates to the duplicate dataset page', async ({ page }) => {
    await page.getByTestId('incoming-dataset-link').click();
    await expect(page).toHaveURL(`/datasets/${pair.duplicate.id}`);
  });

  test('clicking the original dataset link navigates to the original dataset page', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await page.getByTestId('original-dataset-link').click();
    await expect(page).toHaveURL(`/datasets/${pair.original.id}`);
  });
});
