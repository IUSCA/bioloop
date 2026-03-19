const { expect } = require('../fixtures');

/**
 * Tracks selected files metadata from the upload table
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.tableTestId - The test ID of the selected-files table
 * @returns {Promise<Array>} Array of file objects with name and size properties
 */
async function trackSelectedFilesMetadata({ page, tableTestId }) {
  if (!tableTestId) throw new Error('tableTestId is required');
  await expect(page.locator(`[data-testid="${tableTestId}"]`)).toBeVisible();

  const tableRows = page.locator(`[data-testid="${tableTestId}"] tbody tr`);

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
 * @param {string} params.fileSelectTestId - The test ID of the file-select trigger element
 * @returns {Promise<void>}
 */
async function selectFiles({
  page,
  filePaths,
  fileSelectTestId,
}) {
  if (!fileSelectTestId) throw new Error('fileSelectTestId is required');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click(`[data-testid="${fileSelectTestId}"]`),
  ]);
  await fileChooser.setFiles(filePaths);
}

module.exports = {
  trackSelectedFilesMetadata,
  selectFiles,
};
