const { test, expect } = require('@playwright/test');
const { datasets: mockDatasets } = require('../../../../mocks/datasets');

test.describe('Raw Data Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/datasets/all**', async (route) => {
      const url = new URL(route.request().url());
      const qParam = url.searchParams.get('q');
      const params = qParam ? JSON.parse(decodeURIComponent(qParam)) : {};

      let datasets = mockDatasets;

      // Apply filters based on request parameters
      if (params.filters && params.filters.deleted !== undefined) {
        datasets = datasets.filter((d) => d.is_deleted === params.filters.deleted);
      }

      if (params.filters && params.filters.staged !== undefined) {
        datasets = datasets.filter((d) => d.is_staged === params.filters.staged);
      }

      if (params.filters && params.filters.archived !== undefined) {
        datasets = datasets.filter((d) => d.archive_path !== null && typeof d.archive_path === 'string');
      }

      if (params.filters && params.filters.name) {
        datasets = datasets
          .filter((d) => d.name.toLowerCase().includes(params.filters.name.toLowerCase()));
      }

      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          datasets,
          metadata: { count: datasets.length },
        }),
      });
    });

    // Navigate to the raw data page
    await page.goto('/rawdata');
  });

  test('should search and verify results', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('input[data-testid="datasets-search-input"]');

    // Enter the search term
    const searchTerm = 'open';
    await page.fill('input[data-testid="datasets-search-input"]', searchTerm);

    // Wait for the search results to load
    await page.waitForSelector('table[data-testid="datasets-search-results"]');

    // Get all the rows in the search results table
    const rows = await page.$$('table[data-testid="datasets-search-results"] > tbody > tr');

    // Check if there's at least one row
    expect(rows.length).toBeGreaterThan(0);

    // Flag to check if we found a matching result
    let foundMatch = false;

    // Iterate through the rows to find a match
    // eslint-disable-next-line no-restricted-syntax
    for (const row of rows) {
      // Get the text of the name cell (assuming it's the first cell)
      // eslint-disable-next-line no-await-in-loop
      const nameCell = await row.$('td:first-child');
      // eslint-disable-next-line no-await-in-loop
      const name = await nameCell.textContent();

      // Check if the name contains the search term (case-insensitive)
      if (name.toLowerCase().includes(searchTerm.toLowerCase())) {
        foundMatch = true;
        break;
      }
    }

    // Assert that we found at least one matching result
    expect(foundMatch).toBe(true);
  });

  // New test for opening the search modal
  test('should open the search modal', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('input[data-testid="datasets-search-input"]');

    await page.getByTestId('datasets-search-filters').click();
    // click('button[data-testid="datasets-search-filters"]');

    // Wait for the modal to appear
    await page.waitForSelector('div[data-testid="datasets-search-modal"]');

    // Verify that the modal is visible
    const modalVisible = await page.isVisible('div[data-testid="datasets-search-modal"]');
    expect(modalVisible).toBe(true);
  });

  test('should filter datasets based on is_deleted status', async ({ page }) => {
    // Open the search modal
    await page.click('[data-testid="datasets-search-modal"]');

    // Select "Is Deleted" checkbox
    await page.click('[data-testid="deleted_filter"]');

    // Click the search button
    await page.click('[data-testid="dataset-search-button"]');

    // Wait for the table to update
    await page.waitForSelector('.va-data-table__table-wrapper');

    // Check if only deleted datasets are displayed
    const rows = await page.$$('.va-data-table__table-wrapper tbody tr');
    for (const row of rows) {
      const deletedCell = await row.$('td:nth-child(5)'); // Assuming "deleted" is the 5th column
      const checkIcon = await deletedCell.$('.i-mdi-check-circle-outline');
      expect(checkIcon).not.toBeNull();
    }
  });

  test('should filter datasets based on staged status', async ({ page }) => {
    // Open the search modal
    await page.click('[data-testid="datasets-search-filters"]');

    // Select "Staged" filter
    await page.selectOption('[data-testid="staged_filter"]', 'true');

    // Click the search button
    await page.click('[data-testid="dataset-search-button"]');

    // Wait for the table to update
    await page.waitForSelector('.va-data-table__table-wrapper');

    // Check if only staged datasets are displayed
    const rows = await page.$$('.va-data-table__table-wrapper tbody tr');
    for (const row of rows) {
      const stagedCell = await row.$('td:nth-child(4)');
      const checkIcon = await stagedCell.$('.i-mdi-check-circle-outline');
      expect(checkIcon).not.toBeNull();
    }
  });

  test('should filter datasets based on archived status', async ({ page }) => {
    // Open the search modal
    await page.click('[data-testid="datasets-search-filters"]');

    // Select "Archived" filter
    await page.selectOption('[data-testid="archived_filter"]', 'true');

    // Click the search button
    await page.click('[data-testid="dataset-search-button"]');

    // Wait for the table to update
    await page.waitForSelector('.va-data-table__table-wrapper');

    // Check if only archived datasets are displayed
    const rows = await page.$$('.va-data-table__table-wrapper tbody tr');

    expect(rows.length).toBeGreaterThan(0); // Ensure we have results

    // Get the names of displayed datasets
    const displayedDatasetNames = await Promise.all(rows.map(async (row) => {
      const nameCell = await row.$('td:nth-child(1)');
      return await nameCell.textContent();
    }));

    // Filter mock datasets to get only archived ones
    const expectedArchivedDatasets = mockDatasets
      .filter((dataset) => dataset.archive_path !== null);

    // Compare displayed datasets with expected archived datasets
    expect(displayedDatasetNames.length).toBe(expectedArchivedDatasets.length);

    for (const displayedName of displayedDatasetNames) {
      const matchingDataset = expectedArchivedDatasets
        .find((dataset) => dataset.name === displayedName);
      expect(matchingDataset).toBeTruthy();
      expect(matchingDataset.archive_path).not.toBeNull();
    }

    for (const row of rows) {
    // Check the "Archived" column (assuming it's the 3rd column)
      const archivedCell = await row.$('td:nth-child(3)');

      // Verify that the "Archived" column has a check icon
      const checkIcon = await archivedCell.$('.i-mdi-check-circle-outline');
      expect(checkIcon).not.toBeNull();
      expect(checkIcon).toBeVisible();
    }
  });
});
