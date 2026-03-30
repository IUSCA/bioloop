/**
 * Admin-specific tests for the duplication report page.
 *
 * These tests require admin role (uses admin storage state via the
 * admin_duplication Playwright project).
 *
 * Covers:
 * - Admin sees the "View Comparison Logs" button
 * - Admin can open the logs modal
 * - Failed check sections show warning (alert) icons for admin
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const {
  setupDuplicatePair,
  setupDuplicatePairWithPartialMatch,
  setupDuplicatePairWithMovedContent,
} = require('../../../../api/duplication');

// ---------------------------------------------------------------------------
// Admin-only: comparison task logs button and modal
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — admin-only logs button (admin view)', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'admin' });
    pair = await setupDuplicatePair({ token });
  });

  test('admin sees the comparison task logs button', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('view-comparison-logs-btn'),
    ).toBeVisible();
  });

  test('admin logs button is disabled when no process record exists', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('view-comparison-logs-btn')).toBeDisabled();
  });

  test('logs modal shows either no-process message or the log viewer', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    const logsButton = page.getByTestId('view-comparison-logs-btn');
    if (await logsButton.isEnabled()) {
      await logsButton.click();
      const modal = page.getByTestId('comparison-logs-modal');
      await expect(modal).toBeVisible();
      const noProcess = page.getByTestId('comparison-logs-no-process');
      const logsViewer = page.getByTestId('comparison-logs-viewer');
      await expect(noProcess.or(logsViewer)).toBeVisible();
    } else {
      await expect(page.getByTestId('comparison-logs-no-process')).toBeVisible();
    }
  });
});

test.describe.serial('Duplication report — moved/renamed content bucket (admin view)', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'admin' });
    pair = await setupDuplicatePairWithMovedContent({ token });
  });

  test('SAME_CONTENT_DIFFERENT_PATH section shows a warning icon when failed', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-failed-SAME_CONTENT_DIFFERENT_PATH'),
    ).toBeVisible();
  });

  test('summary metrics show moved/renamed count for path-different content matches', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('summary-metric-renamed-moved-count')).toContainText('1');
    await expect(page.getByTestId('summary-metric-same-path-modified-count')).toContainText('0');
  });
});

// ---------------------------------------------------------------------------
// Admin view: check section icons for failed sections
// ---------------------------------------------------------------------------
test.describe.serial('Duplication report — warning icons on failed checks (admin view)', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'admin' });
    // Partial match: SAME_PATH_DIFFERENT_CONTENT is failed (passed=false).
    pair = await setupDuplicatePairWithPartialMatch({ token });
  });

  test('SAME_PATH_DIFFERENT_CONTENT section shows a warning (alert) icon when failed', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-failed-SAME_PATH_DIFFERENT_CONTENT'),
    ).toBeVisible();
  });

  test('EXACT_CONTENT_MATCHES section shows a success (checkmark) icon even in partial match', async ({ page }) => {
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(
      page.getByTestId('check-icon-passed-EXACT_CONTENT_MATCHES'),
    ).toBeVisible();
  });
});
