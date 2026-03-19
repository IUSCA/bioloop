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
  await page.locator('[data-testid="upload-container"]').first().waitFor({
    state: 'visible',
    timeout: 15000,
  });

  const candidates = [
    '[data-testid="upload-container"] input[type="file"]:not([data-testid="folder-upload-input"])',
    '[data-testid="upload-file-select"] input[type="file"]',
    'input[type="file"]:not([data-testid="folder-upload-input"])',
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const fileInput = page.locator(candidates[index]).first();
    try {
      await fileInput.waitFor({ state: 'attached', timeout: 15000 });
      await fileInput.setInputFiles(filePaths);
      return;
    } catch (error) {
      // Try the next known uploader input shape.
    }
  }

  throw new Error(
    'Unable to locate a file input for upload. Checked known upload selectors.',
  );
}

/**
 * Selects a directory for upload via the hidden folder input.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string[]} params.filePaths - Array of file paths in one directory tree
 * @returns {Promise<void>}
 */
async function selectDirectory({
  page,
  filePaths,
}) {
  const folderButton = page.getByTestId('select-folder-button');
  await expect(folderButton).toBeVisible();

  const folderInput = page.locator('[data-testid="folder-upload-input"]').first();
  await folderInput.waitFor({ state: 'attached', timeout: 10000 });
  await folderInput.setInputFiles(filePaths);
}

/**
 * Enables or clears upload-failure simulation flags in localStorage.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string|null} [params.mode] - Simulation mode, e.g. "mid-upload"
 * @param {number|null} [params.count] - Number of failures before success
 * @returns {Promise<void>}
 */
async function setUploadFailureSimulation({
  page,
  mode = null,
  count = null,
}) {
  await page.evaluate(({ _mode, _count }) => {
    localStorage.removeItem('SIMULATE_UPLOAD_FAILURE');
    localStorage.removeItem('SIMULATE_UPLOAD_FAILURE_COUNT');

    if (_mode) {
      localStorage.setItem('SIMULATE_UPLOAD_FAILURE', _mode);
    }

    if (_count != null) {
      localStorage.setItem('SIMULATE_UPLOAD_FAILURE_COUNT', String(_count));
    }
  }, { _mode: mode, _count: count });
}

module.exports = {
  trackSelectedFilesMetadata,
  selectFiles,
  selectDirectory,
  setUploadFailureSimulation,
};
