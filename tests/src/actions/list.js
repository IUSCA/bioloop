const { expect } = require('../fixtures');

/**
 * Waits for table results to finish updating after a search or filter
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the table
 * @returns {Promise<void>}
 */
async function waitForResultsUpdate({
  page,
  testId,
}) {
  await page.waitForFunction(
    (tableTestId) => {
      const table = document.querySelector(`[data-testid="${tableTestId}"]`);
      return table && !table.classList.contains('va-data-table--loading');
    },
    testId, // This is passed as the argument tableTestId to the anonymous function above
    { timeout: 5000 },
  );
}

/**
 * Gets all values from a column in a table with dynamic row test IDs
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.columnName - The name of the column to get values from
 * @param {string} params.testId - The test ID of the table
 * @returns {Promise<string[]>} Array of column values
 */
async function getColumnValues({
  page,
  columnName,
  testId,
}) {
  // Build selector that matches: testIdPrefix-row-{number}-columnName
  // Example: "dataset-list-row-0-name", "project-list-row-1-size", etc.
  // CSS attribute selectors:
  // - ^= means "starts with"
  // - $= means "ends with"
  const selector = `[data-testid^="${testId}-row-"][data-testid$="-${columnName}"]`;
  const columnValues = page.locator(selector);
  const count = await columnValues.count();

  const values = await Promise.all(
    Array.from({ length: count }, (_, i) => columnValues.nth(i).textContent()),
  );

  return values.map((value) => value.trim());
}

/**
 * Asserts that a table is visible
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the table
 * @returns {Promise<void>}
 */
async function assertTableVisible({
  page,
  testId,
}) {
  const table = page.getByTestId(testId);
  await expect(table).toBeVisible();
}

/**
 * Asserts that a table contains a specific number of rows
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} params.count - Expected number of rows
 * @param {string} params.testId - The test ID of the table
 * @returns {Promise<void>}
 */
async function assertTableCount({
  page,
  count,
  testId,
}) {
  const table = page.getByTestId(testId);
  await expect(table).toHaveCount(count);
}

/**
 * Clicks on a row in a table
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} params.index - Index of the row to click (0-based)
 * @param {string} params.testId - The test ID of the table
 * @returns {Promise<void>}
 */
async function clickTableRowByIndex({
  page,
  index,
  testId,
}) {
  const table = page.getByTestId(testId);
  await table.nth(index).click();
}

/**
 * Searches for results using a search input
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.searchTerm - The term to search for
 * @param {string} params.testId - The test ID of the search input
 * @param {string} [params.inputTestId] - The test ID of the search input
 * @param {boolean} [params.waitForResults=true] - Whether to wait for results to be updated
 * @returns {Promise<void>}
 */
async function initiateSearch({
  page,
  searchTerm,
  testId,
  inputTestId,
  waitForResults = true,
}) {
  const _inputTestId = inputTestId || `${testId}-input`;
  const searchInput = page.getByTestId(_inputTestId);
  await expect(searchInput).toBeVisible();
  await searchInput.fill(searchTerm);

  // Wait for results to be updated
  if (waitForResults) {
    await waitForResultsUpdate({ page, testId });
  }
}

/**
 * Clears a search input
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the search input
 * @param {string} [params.inputTestId] - The test ID of the search input
 * @param {boolean} [params.waitForResults=true] - Whether to wait for results to be updated
 * @returns {Promise<void>}
 */
async function clearSearchInput({
  page,
  testId,
  inputTestId,
  waitForResults = true,
}) {
  const _inputTestId = inputTestId || `${testId}-input`;
  const input = page.getByTestId(_inputTestId);
  await expect(input).toBeVisible();
  await input.clear();

  // Wait for results to be updated
  if (waitForResults) {
    await waitForResultsUpdate({ page, testId });
  }
}

module.exports = {
  getColumnValues,
  assertTableVisible,
  assertTableCount,
  clickTableRowByIndex,
  initiateSearch,
  waitForResultsUpdate,
  clearSearchInput,
};
