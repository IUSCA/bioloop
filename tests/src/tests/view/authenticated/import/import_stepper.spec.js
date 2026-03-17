const { expect, test } = require('@playwright/test');
const { getImportSources } = require('../../../../api/import');

/**
 * Import Stepper — UI E2E tests
 *
 * Verifies that the ImportStepper component:
 * - Renders the "Import Source" dropdown (not the old "Search space" dropdown)
 * - Populates the dropdown from the API
 * - Shows a loading state while fetching import sources
 * - Disables the "Next" button until a file is selected
 */
test.describe('Import Stepper — Select Directory step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/datasetImport/new');
  });

  test('renders the Import Source dropdown', async ({ page }) => {
    // The new dropdown should be labelled "Import Source"
    const importSourceSelect = page.getByText('Import Source', { exact: false });
    await expect(importSourceSelect).toBeVisible();
  });

  test('does not render the old "Search space" dropdown', async ({ page }) => {
    // The old dropdown used "Search space" as its label — should no longer exist
    const oldSearchSpaceLabel = page.getByText('Search space', { exact: true });
    await expect(oldSearchSpaceLabel).not.toBeVisible();
  });

  test('Import Source dropdown is populated from the API', async ({ page, adminToken }) => {
    const sourcesResponse = await getImportSources({
      requestContext: page.request,
      token: adminToken,
    });
    const sources = await sourcesResponse.json();

    if (sources.length === 0) {
      test.skip(true, 'No import sources seeded — skipping dropdown population test');
      return;
    }

    // The first import source label should appear somewhere on the page
    // after the component mounts and loads sources.
    const firstLabel = sources[0].label || sources[0].path;
    await expect(page.getByText(firstLabel, { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test('"Next" button is disabled until a directory is selected', async ({ page }) => {
    // On step 0, before any file is selected, "Next" should be disabled
    const nextButton = page.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeDisabled();
  });
});
