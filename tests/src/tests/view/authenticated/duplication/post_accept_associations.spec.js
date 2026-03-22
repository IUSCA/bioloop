/**
 * Tests for the side-effects of accepting a duplicate: association transfers.
 *
 * All scenarios set up their data entirely via API helpers and accept the
 * duplicate programmatically so these tests focus exclusively on the resulting
 * UI state, not the accept flow itself (which is covered by accept_duplicate.spec.js).
 *
 * Covers:
 * - Accepted duplicate adopts the original's name (name shown on its detail page)
 * - Project "Associated Datasets" table shows the accepted duplicate, not the original
 * - Source Datasets section on a child dataset's page shows the accepted duplicate
 * - Derived Datasets section on a parent dataset's page shows the accepted duplicate
 * - Sibling duplicate (same original) is auto-rejected when one duplicate is accepted
 */

const { test, expect } = require('@playwright/test');
const { getTokenByRole } = require('../../../../fixtures/auth');
const { setupDuplicatePair } = require('../../../../api/duplication');
const { acceptDuplicate } = require('../../../../api/duplication');
const { createDataset, createDatasetAssociation } = require('../../../../api/dataset');
const { createProject, editProjectDatasets } = require('../../../../api/project');

// ---------------------------------------------------------------------------
// Scenario A — name adoption
// ---------------------------------------------------------------------------
test.describe.serial('After accept: duplicate adopts original name', () => {
  let pair;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });
    pair = await setupDuplicatePair({ token });
    await acceptDuplicate({ token, datasetId: pair.duplicate.id });
  });

  test('accepted duplicate detail page shows the original name', async ({ page }) => {
    // The duplication report header always renders incoming-dataset-link, and
    // after acceptance the duplicate adopts the original dataset name.
    await page.goto(`/datasets/${pair.duplicate.id}/duplication`);
    await expect(page.getByTestId('incoming-dataset-link')).toContainText(pair.original.name);
  });
});

// ---------------------------------------------------------------------------
// Scenario B — project association transfer
// ---------------------------------------------------------------------------
test.describe.serial('After accept: project associated datasets table is updated', () => {
  let pair;
  let project;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });

    project = await createProject({ token, data: { name: `dup-transfer-${Date.now()}` } });
    pair = await setupDuplicatePair({ token });

    await editProjectDatasets({
      token,
      id: project.id,
      data: { add_dataset_ids: [pair.original.id] },
    });

    await acceptDuplicate({ token, datasetId: pair.duplicate.id });
  });

  test('accepted duplicate appears in project Associated Datasets table', async ({ page }) => {
    await page.goto(`/projects/${project.id}`);
    const duplicateLink = page.locator(
      `[data-testid="project-dataset-link-${pair.duplicate.id}"]:visible`,
    );
    await expect(duplicateLink).toBeVisible({ timeout: 15000 });
  });

  test('overwritten original does not appear in project Associated Datasets table', async ({ page }) => {
    await page.goto(`/projects/${project.id}`);
    const originalLink = page.locator(
      `[data-testid="project-dataset-link-${pair.original.id}"]:visible`,
    );
    await expect(originalLink).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario C — source/derived hierarchy transfer
// ---------------------------------------------------------------------------
test.describe.serial('After accept: source/derived dataset sections are updated', () => {
  let pair;
  // A downstream dataset that lists the original as its source.
  let childDataset;
  // An upstream dataset that lists the original as its derived.
  let parentDataset;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });

    pair = await setupDuplicatePair({ token });

    // childDataset is derived FROM original (original is a source of child).
    childDataset = await createDataset({ token });
    await createDatasetAssociation({
      token,
      sourceId: pair.original.id,
      derivedId: childDataset.id,
    });

    // parentDataset has original as a derived dataset (parent is a source of original).
    parentDataset = await createDataset({ token });
    await createDatasetAssociation({
      token,
      sourceId: parentDataset.id,
      derivedId: pair.original.id,
    });

    await acceptDuplicate({ token, datasetId: pair.duplicate.id });
  });

  // Source datasets section on the child's page
  test('child dataset Source Datasets card shows the accepted duplicate', async ({ page }) => {
    await page.goto(`/datasets/${childDataset.id}`);
    await expect(
      page.getByTestId('source-datasets-card').getByTestId(
        `assoc-dataset-link-${pair.duplicate.id}`,
      ),
    ).toBeVisible();
  });

  test('child dataset Source Datasets card does NOT show the original', async ({ page }) => {
    await page.goto(`/datasets/${childDataset.id}`);
    await expect(
      page.getByTestId('source-datasets-card').getByTestId(
        `assoc-dataset-link-${pair.original.id}`,
      ),
    ).not.toBeVisible();
  });

  // Derived datasets section on the parent's page
  test('parent dataset Derived Datasets card shows the accepted duplicate', async ({ page }) => {
    await page.goto(`/datasets/${parentDataset.id}`);
    await expect(
      page.getByTestId('derived-datasets-card').getByTestId(
        `assoc-dataset-link-${pair.duplicate.id}`,
      ),
    ).toBeVisible();
  });

  test('parent dataset Derived Datasets card does NOT show the original', async ({ page }) => {
    await page.goto(`/datasets/${parentDataset.id}`);
    await expect(
      page.getByTestId('derived-datasets-card').getByTestId(
        `assoc-dataset-link-${pair.original.id}`,
      ),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario D — sibling auto-rejection
// ---------------------------------------------------------------------------
test.describe.serial('After accept: sibling duplicate is auto-rejected', () => {
  let original;
  let dup1;
  let dup2;

  test.beforeAll(async () => {
    const token = await getTokenByRole({ role: 'operator' });

    // Create one original and two separate duplicate pairs pointing at it.
    const pair1 = await setupDuplicatePair({ token });
    original = pair1.original;
    dup1 = pair1.duplicate;

    // Register dup2 manually against the same original.
    const { registerDuplicate, saveComparisonResult } = require('../../../../api/duplication');
    dup2 = await createDataset({ token, data: { type: 'RAW_DATA' } });
    await registerDuplicate({ token, datasetId: dup2.id, originalDatasetId: original.id });
    await saveComparisonResult({ token, datasetId: dup2.id });

    // Accept dup1 — this triggers reject_concurrent_active_duplicates for dup2.
    await acceptDuplicate({ token, datasetId: dup1.id });
  });

  test('dup2 detail page shows the "rejected duplicate" danger alert', async ({ page }) => {
    await page.goto(`/datasets/${dup2.id}`);
    await expect(page.getByTestId('duplication-alert-rejected-duplicate')).toBeVisible();
  });

  test('dup2 duplication page shows the resolved/rejected state', async ({ page }) => {
    await page.goto(`/datasets/${dup2.id}/duplication`);
    await expect(page.getByTestId('duplication-resolved')).toBeVisible();
    await expect(page.getByTestId('duplication-resolved')).toContainText('rejected');
  });

  test('dup2 duplication page does NOT show accept or reject buttons', async ({ page }) => {
    await page.goto(`/datasets/${dup2.id}/duplication`);
    await expect(page.getByTestId('accept-duplicate-btn')).not.toBeVisible();
    await expect(page.getByTestId('reject-duplicate-btn')).not.toBeVisible();
  });
});
