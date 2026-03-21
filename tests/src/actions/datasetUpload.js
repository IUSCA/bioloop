const { expect } = require('../fixtures');

/**
 * Tracks selected files metadata from the upload table
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<Array>} Array of file objects with name and size properties
 */
async function trackSelectedFilesMetadata({ page }) {
  // Wait for the file upload table to be visible
  await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

  // Get all rows in the table
  const tableRows = page.locator('[data-testid="upload-selected-files-table"] tbody tr');

  // For each row, extract the file name and size
  const files = await tableRows.evaluateAll((rows) => rows.map((row) => {
    const nameElement = row.querySelector('[data-testid="file-name"]');
    const sizeElement = row.querySelector('td:nth-child(2)');

    return {
      name: nameElement ? nameElement.textContent.trim() : '',
      size: sizeElement ? sizeElement.textContent.trim() : '',
    };
  }));

  return files;
}

/**
 * Selects files for upload
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string[]} params.filePaths - Array of file paths to upload
 * @returns {Promise<void>}
 */
async function selectFiles({
  page,
  filePaths,
}) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-testid="upload-file-select"]'),
  ]);
  await fileChooser.setFiles(filePaths);
}

module.exports = {
  trackSelectedFilesMetadata,
  selectFiles,
};
