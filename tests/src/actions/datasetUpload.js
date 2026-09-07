const { expect } = require('../fixtures');
const { navigateToNextStep } = require('./stepper');

/**
 * Opens the first step of the new dataset upload flow.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<void>}
 */
async function openNewUpload({ page }) {
  await page.goto('/datasets/uploads/new');
}

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

async function setFilesUsingKnownInput({
  page,
  filePaths,
  candidates,
  candidateIndex = 0,
}) {
  if (candidateIndex >= candidates.length) {
    throw new Error(
      'Unable to locate a file input for upload. Checked known upload selectors.',
    );
  }

  const fileInput = page.locator(candidates[candidateIndex]).first();
  try {
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(filePaths);
  } catch (error) {
    await setFilesUsingKnownInput({
      page,
      filePaths,
      candidates,
      candidateIndex: candidateIndex + 1,
    });
  }
}

/**
 * Selects files for upload
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string[]} params.filePaths - Array of file paths to upload
 * @param {string} [params.fileSelectTestId] - File-select trigger test ID
 * @returns {Promise<void>}
 */
async function selectFiles({
  page,
  filePaths,
  fileSelectTestId,
}) {
  await page.locator('[data-testid="upload-container"]').first().waitFor({
    state: 'visible',
    timeout: 15000,
  });

  const candidates = [
    ...(fileSelectTestId
      ? [`[data-testid="${fileSelectTestId}"] input[type="file"]`]
      : []),
    '[data-testid="upload-container"] input[type="file"]:not([data-testid="folder-upload-input"])',
    '[data-testid="upload-file-select"] input[type="file"]',
    'input[type="file"]:not([data-testid="folder-upload-input"])',
  ];

  await setFilesUsingKnownInput({ page, filePaths, candidates });
}

/**
 * Selects files and advances from file selection to the General Info step.
 * Keep this helper limited to shared navigation: each spec still supplies its
 * own metadata and assertions after General Info is shown.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string[]} params.filePaths - Array of file paths to upload
 * @param {string} [params.fileSelectTestId] - File selector test ID
 * @returns {Promise<void>}
 */
async function selectFilesAndGoToGeneralInfo({
  page,
  filePaths,
  fileSelectTestId,
}) {
  await selectFiles({ page, filePaths, fileSelectTestId });
  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
  await expect(page.getByTestId('upload-metadata-dataset-type-select')).toBeVisible();
}

/**
 * Selects a directory for upload via the hidden folder input.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.directoryPath - Path to the directory to upload
 * @returns {Promise<void>}
 */
async function selectDirectory({
  page,
  directoryPath,
}) {
  const folderButton = page.getByTestId('select-folder-button');
  await expect(folderButton).toBeVisible();

  const folderInput = page.locator('[data-testid="folder-upload-input"]').first();
  await folderInput.waitFor({ state: 'attached', timeout: 10000 });
  await folderInput.setInputFiles(directoryPath);
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
    globalThis.localStorage.removeItem('SIMULATE_UPLOAD_FAILURE');
    globalThis.localStorage.removeItem('SIMULATE_UPLOAD_FAILURE_COUNT');

    if (_mode) {
      globalThis.localStorage.setItem('SIMULATE_UPLOAD_FAILURE', _mode);
    }

    if (_count != null) {
      globalThis.localStorage.setItem(
        'SIMULATE_UPLOAD_FAILURE_COUNT',
        String(_count),
      );
    }
  }, { _mode: mode, _count: count });
}

module.exports = {
  openNewUpload,
  trackSelectedFilesMetadata,
  selectFiles,
  selectFilesAndGoToGeneralInfo,
  selectDirectory,
  setUploadFailureSimulation,
};
