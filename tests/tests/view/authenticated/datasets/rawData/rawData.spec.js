const { test, expect } = require('@playwright/test');

test.describe('Raw Data Search', () => {
  test('should search and verify results', async ({ page }) => {
    // Navigate to the raw data page
    await page.goto('/rawdata');

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
});
