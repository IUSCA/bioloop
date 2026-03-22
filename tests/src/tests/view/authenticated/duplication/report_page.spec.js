/**
 * Tests for the duplication report page (/datasets/:id/duplication).
 *
 * Covers:
 * - Page renders the summary header (Jaccard score, formula, status badge,
 *   dataset links)
 * - Page renders the file-level comparison body (one section per check type)
 * - Status alert shown when comparison is still PENDING
 * - Status alert shown when duplicate is already resolved
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const {
  setupDuplicatePair,
  registerDuplicate,
  rejectDuplicate,
  acceptDuplicate,
} = require('../../../../api/duplication');
const { createDataset } = require('../../../../api/dataset');

test.describe.serial('Duplication report page — DUPLICATE_READY', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
  });

  // -------------------------------------------------------------------------
  // Report header
  // -------------------------------------------------------------------------
  test('report header card is visible', async ({ page }) => {
    await expect(page.getByTestId('report-header')).toBeVisible();
  });

  test('Jaccard score is displayed as a percentage', async ({ page }) => {
    // Default setup uses jaccard_score = 1.0 → 100%
    await expect(page.getByTestId('jaccard-score')).toBeVisible();
    await expect(page.getByTestId('jaccard-score')).toContainText('100');
  });

  test('Jaccard formula breakdown is displayed with numeric values', async ({ page }) => {
    // Default: 3 common / (3 incoming + 3 original - 3 common) = 3/3
    await expect(page.getByTestId('jaccard-formula')).toBeVisible();
    await expect(page.getByTestId('jaccard-formula')).toContainText('100%');
    await expect(page.getByTestId('jaccard-formula')).toContainText('3');
  });

  test('comparison status badge shows COMPLETED', async ({ page }) => {
    await expect(page.getByTestId('comparison-status-badge')).toBeVisible();
    await expect(page.getByTestId('comparison-status-badge')).toContainText('COMPLETED');
  });

  test('incoming dataset link is shown with the correct name', async ({ page }) => {
    await expect(page.getByTestId('incoming-dataset-link')).toBeVisible();
    await expect(page.getByTestId('incoming-dataset-link')).toContainText(pair.duplicate.name);
  });

  test('original dataset link is shown with the correct name', async ({ page }) => {
    await expect(page.getByTestId('original-dataset-link')).toBeVisible();
    await expect(page.getByTestId('original-dataset-link')).toContainText(pair.original.name);
  });

  // -------------------------------------------------------------------------
  // Report body (check sections)
  // -------------------------------------------------------------------------
  test('report body card is visible', async ({ page }) => {
    await expect(page.getByTestId('report-body')).toBeVisible();
  });

  test('EXACT_CONTENT_MATCHES check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-EXACT_CONTENT_MATCHES')).toBeVisible();
  });

  test('SAME_PATH_SAME_CONTENT check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_PATH_SAME_CONTENT')).toBeVisible();
  });

  test('SAME_PATH_DIFFERENT_CONTENT check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_PATH_DIFFERENT_CONTENT')).toBeVisible();
  });

  test('SAME_CONTENT_DIFFERENT_PATH check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-SAME_CONTENT_DIFFERENT_PATH')).toBeVisible();
  });

  test('ONLY_IN_INCOMING check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_INCOMING')).toBeVisible();
  });

  test('ONLY_IN_ORIGINAL check section is present', async ({ page }) => {
    await expect(page.getByTestId('check-section-ONLY_IN_ORIGINAL')).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Accept / Reject controls present and enabled for DUPLICATE_READY
  // -------------------------------------------------------------------------
  test('Accept Duplicate button is visible and enabled', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('accept-duplicate-btn')).toBeEnabled();
  });

  test('Reject Duplicate button is visible and enabled', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Report page when comparison is still PENDING
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report page — comparison PENDING', () => {
  let pendingDuplicate;
  let originalDataset;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    originalDataset = await createDataset({ token, data: { type: 'RAW_DATA' } });
    const duplicate = await createDataset({ token, data: { type: 'RAW_DATA' } });
    // Register without calling saveComparisonResult → stays PENDING
    await registerDuplicate({
      token,
      datasetId: duplicate.id,
      originalDatasetId: originalDataset.id,
      comparisonStatus: 'PENDING',
    });
    pendingDuplicate = duplicate;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${pendingDuplicate.id}/duplication`);
  });

  test('shows the "comparison still running" info alert', async ({ page }) => {
    await expect(page.getByTestId('duplication-comparison-pending')).toBeVisible();
  });

  test('Accept Duplicate button is disabled while comparison is PENDING', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-btn')).toBeDisabled();
  });

  test('Reject Duplicate button is disabled while comparison is PENDING', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Report page for an already-resolved (rejected) duplicate
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report page — already resolved (rejected)', () => {
  let resolvedPair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    resolvedPair = await setupDuplicatePair({ token });
    await rejectDuplicate({ token, datasetId: resolvedPair.duplicate.id });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${resolvedPair.duplicate.id}/duplication`);
  });

  test('shows the "already resolved" alert', async ({ page }) => {
    await expect(page.getByTestId('duplication-resolved')).toBeVisible();
  });

  test('"resolved" alert says "rejected"', async ({ page }) => {
    await expect(page.getByTestId('duplication-resolved')).toContainText('rejected');
  });

  test('Accept Duplicate button is not visible for a resolved duplicate', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
  });

  test('Reject Duplicate button is not visible for a resolved duplicate', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Report page for an already-resolved (accepted) duplicate
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report page — already resolved (accepted)', () => {
  let acceptedPair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    acceptedPair = await setupDuplicatePair({ token });
    await acceptDuplicate({ token, datasetId: acceptedPair.duplicate.id });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/datasets/${acceptedPair.duplicate.id}/duplication`);
  });

  test('shows the "already resolved" alert', async ({ page }) => {
    await expect(page.getByTestId('duplication-resolved')).toBeVisible();
  });

  test('"resolved" alert says "accepted"', async ({ page }) => {
    await expect(page.getByTestId('duplication-resolved')).toContainText('accepted');
  });

  test('Accept Duplicate button is not visible for an accepted duplicate', async ({ page }) => {
    await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
  });

  test('Reject Duplicate button is not visible for an accepted duplicate', async ({ page }) => {
    await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();
  });

  // The header and body should still render for accepted duplicates so
  // operators can review what was compared.
  test('report header is still shown for an accepted duplicate', async ({ page }) => {
    await expect(page.getByTestId('report-header')).toBeVisible();
  });

  test('report body is still shown for an accepted duplicate', async ({ page }) => {
    await expect(page.getByTestId('report-body')).toBeVisible();
  });
});
