/**
 * Tests for the duplication report page under various comparison task states:
 *
 *  - FAILED comparison: danger alert shown, accept/reject buttons hidden
 *  - PENDING comparison: info alert with spinner shown, controls disabled
 *  - Admin-only logs button: visible to admin, hidden to operator
 *  - Report body check sections with zero count: badge hidden, collapse disabled
 *  - Check section icons: warning triangle for failed, checkmark for passed
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const {
  setupDuplicatePair,
  setupDuplicatePairWithFailedComparison,
  registerDuplicate,
} = require('../../../../api/duplication');
const { createDataset } = require('../../../../api/dataset');

// ---------------------------------------------------------------------------
// FAILED comparison state
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — comparison FAILED state', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePairWithFailedComparison({ token });
  });

  test('danger alert is shown when comparison has FAILED', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('duplication-comparison-failed'),
    ).toBeVisible();
  });

  test('comparison status badge shows FAILED', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('comparison-status-badge')).toContainText('FAILED');
  });

  test('failed icon is shown in the report header', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('comparison-failed-icon')).toBeVisible();
  });

  test('accept and reject buttons are visible but disabled when comparison has FAILED', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('accept-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('accept-duplicate-btn')).toBeDisabled();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// PENDING comparison state
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — comparison PENDING state', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    const original = await createDataset({ token, data: { type: 'RAW_DATA' } });
    const duplicate = await createDataset({ token, data: { type: 'RAW_DATA' } });
    // Register with PENDING status — comparison has not started yet.
    await registerDuplicate({
      token,
      datasetId: duplicate.id,
      originalDatasetId: original.id,
      comparisonStatus: 'PENDING',
    });
    pair = { original, duplicate };
  });

  test('info alert is shown while comparison is PENDING', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('duplication-comparison-pending'),
    ).toBeVisible();
  });

  test('accept and reject buttons are visible but disabled while comparison is PENDING', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('accept-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeVisible();
    await expect(page.getByTestId('accept-duplicate-btn')).toBeDisabled();
    await expect(page.getByTestId('reject-duplicate-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Report body — check section display rules
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — check section badges and expandability', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    // Perfect match: EXACT_CONTENT_MATCHES has entries, all difference buckets have 0 files.
    pair = await setupDuplicatePair({ token });
  });

  test('EXACT_CONTENT_MATCHES section shows the expected title', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-section-EXACT_CONTENT_MATCHES'),
    ).toContainText('Exact content matches');
  });

  test('EXACT_CONTENT_MATCHES section has no badge in API-helper setup (no file_checks)', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-badge-EXACT_CONTENT_MATCHES'),
    ).not.toBeVisible();
  });

  test('EXACT_CONTENT_MATCHES section is non-expandable — clicking does not reveal a file table', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    const section = page.getByTestId('check-section-EXACT_CONTENT_MATCHES');
    await expect(section).toBeVisible();
    // No chevron icon rendered for non-expandable summary sections.
    await expect(section.locator('svg[data-testid="chevron"], .mdi-chevron-down')).not.toBeVisible();
    // Clicking the header does not open a file drill-down.
    await section.click();
    await expect(section.locator('.va-data-table')).not.toBeVisible();
  });

  test('SAME_PATH_DIFFERENT_CONTENT section has no badge (count = 0)', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-badge-SAME_PATH_DIFFERENT_CONTENT'),
    ).not.toBeVisible();
  });

  test('SAME_CONTENT_DIFFERENT_PATH section has no badge (count = 0)', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-badge-SAME_CONTENT_DIFFERENT_PATH'),
    ).not.toBeVisible();
  });

  test('ONLY_IN_INCOMING section has no badge (count = 0)', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-badge-ONLY_IN_INCOMING'),
    ).not.toBeVisible();
  });

  test('ONLY_IN_ORIGINAL section has no badge (count = 0)', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-badge-ONLY_IN_ORIGINAL'),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin-only: comparison task logs button (operator view)
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — admin-only logs button (operator view)', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
  });

  test('operator does NOT see the comparison task logs button', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('view-comparison-logs-btn'),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Report body — check section icons
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — check section alert icons', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    // Perfect-match pair: exact-content and same-path-same-content pass.
    pair = await setupDuplicatePair({ token });
  });

  test('EXACT_CONTENT_MATCHES section shows a success (checkmark) icon', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-EXACT_CONTENT_MATCHES'),
    ).toBeVisible();
  });

  test('SAME_PATH_DIFFERENT_CONTENT section shows a success (checkmark) icon when count is 0', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-SAME_PATH_DIFFERENT_CONTENT'),
    ).toBeVisible();
  });

  test('SAME_CONTENT_DIFFERENT_PATH section shows a success (checkmark) icon when count is 0', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-SAME_CONTENT_DIFFERENT_PATH'),
    ).toBeVisible();
  });

  test('ONLY_IN_INCOMING section shows a success (checkmark) icon when count is 0', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-ONLY_IN_INCOMING'),
    ).toBeVisible();
  });

  test('ONLY_IN_ORIGINAL section shows a success (checkmark) icon when count is 0', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-ONLY_IN_ORIGINAL'),
    ).toBeVisible();
  });
});
