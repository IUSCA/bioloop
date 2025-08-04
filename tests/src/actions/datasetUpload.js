import { expect } from '@playwright/test';

import { cleanDropdownOptionText } from '../utils';

/**
 * Selects a dataset type from the dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.datasetType] - The Dataset Type to select by name
 * @param {number} [params.optionIndex] - The index of the option to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string>} The text of the selected option
 */
export async function selectDatasetType({
  page,
  datasetType,
  optionIndex,
  verify = false,
}) {
  // Validate that exactly one selection method is provided
  if ((datasetType != null && optionIndex != null)
      || (datasetType == null && optionIndex == null)) {
    throw new Error('Must provide either datasetType or optionIndex, but not both');
  }

  const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
  await expect(datasetTypeSelect).toBeVisible();

  // Open Dataset Type dropdown
  await datasetTypeSelect.click();

  // Wait for the dropdown options to appear
  await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });

  const options = page.locator('.va-select-option');
  let targetIndex;
  let selectedOptionText;

  if (datasetType) {
    // Selection by name
    const optionCount = await options.count();

    // Create array of indices and map to promises that resolve option text
    const optionTexts = await Promise.all(
      /* eslint-disable */
        Array.from({ length: optionCount }, (_, i) => {
        return options.nth(i).textContent().then((text) => cleanDropdownOptionText(text))
      }),
      /* eslint-enable */
    );

    // Find the index of the matching dataset type
    targetIndex = optionTexts.findIndex((text) => text === datasetType);

    if (targetIndex === -1) {
      throw new Error(`Dataset type "${datasetType}" not found in dropdown options`);
    }

    selectedOptionText = optionTexts[targetIndex];
  } else {
    // Selection by index
    targetIndex = optionIndex;
    const targetOption = options.nth(targetIndex);
    selectedOptionText = await targetOption.textContent();
    selectedOptionText = cleanDropdownOptionText(selectedOptionText);
  }

  // Click the target option
  const targetOption = options.nth(targetIndex);
  await targetOption.click();

  // Verify that the correct value was selected
  if (verify) {
    const selectedValueElement = datasetTypeSelect.locator('.va-select-content__option');
    const selectedValue = (await selectedValueElement.textContent()).trim();
    await expect(selectedValue).toBe(selectedOptionText);
  }

  return selectedOptionText;
}

/**
 * Selects source Raw Data from the autocomplete dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} [params.resultIndex=0] - The index of the search result to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string|void>} The text of the selected option if verify is true, otherwise void
 */
export async function selectSourceRawData({ page, resultIndex = 0, verify = false }) {
  // Validate that resultIndex is provided
  if (resultIndex == null) {
    throw new Error('Must provide resultIndex parameter');
  }

  const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
  await expect(datasetSearchInput).toBeVisible();

  // Click the input field, which will trigger the Dataset search
  await page.click('input[data-testid="upload-metadata-dataset-autocomplete"]');

  // Capture the text of the search result before clicking it
  const searchResultLocator = page.getByTestId(`upload-metadata-dataset-autocomplete--search-result-li-${resultIndex}`);
  let selectedOptionText;

  if (verify) {
    // Wait for the search result to be visible and capture its text
    await expect(searchResultLocator).toBeVisible();
    selectedOptionText = (await searchResultLocator.textContent()).trim();
  }

  // Select the search result at the specified index
  await searchResultLocator.click();

  // Verify that the correct value was selected if requested
  if (verify) {
    // Wait for the input to be populated with the selected value
    const inputElement = page.locator('input[data-testid="upload-metadata-dataset-autocomplete"]');
    await expect(inputElement).toHaveValue(selectedOptionText);
    return selectedOptionText;
  }
}

/**
 * Selects a project from the autocomplete dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} [params.resultIndex=0] - The index of the search result to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string|void>} The text of the selected option if verify is true, otherwise void
 */
export async function selectProject({ page, resultIndex = 0, verify = false }) {
  // Validate that resultIndex is provided
  if (resultIndex == null) {
    throw new Error('Must provide resultIndex parameter');
  }

  const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
  await expect(projectSearchInput).toBeVisible();

  // Click the input field, which will trigger the Project search
  await page.click('input[data-testid="upload-metadata-project-autocomplete"]');

  // Capture the text of the search result before clicking it
  const searchResultLocator = page.getByTestId(`upload-metadata-project-autocomplete--search-result-li-${resultIndex}`);
  let selectedOptionText;

  if (verify) {
    // Wait for the search result to be visible and capture its text
    await expect(searchResultLocator).toBeVisible();
    selectedOptionText = (await searchResultLocator.textContent()).trim();
  }

  // Select the search result at the specified index
  await searchResultLocator.click();

  // Verify that the correct value was selected if requested
  if (verify) {
    // Wait for the input to be populated with the selected value
    const inputElement = page.locator('input[data-testid="upload-metadata-project-autocomplete"]');
    await expect(inputElement).toHaveValue(selectedOptionText);
    return selectedOptionText;
  }
}

/**
 * Selects a source instrument from the dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.instrumentName] - The instrument name to select
 * @param {number} [params.optionIndex] - The index of the option to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string>} The text of the selected option
 */
export async function selectSourceInstrument({ page, instrumentName, optionIndex, verify = false }) {
  // Validate that exactly one selection method is provided
  if ((instrumentName && optionIndex !== undefined)
      || (!instrumentName && optionIndex === undefined)) {
    throw new Error('Must provide either instrumentName or optionIndex, but not both');
  }

  const sourceInstrumentSelect = page.getByTestId('upload-metadata-source-instrument-select');
  await expect(sourceInstrumentSelect).toBeVisible();

  // Open Source Instrument dropdown
  await sourceInstrumentSelect.click();

  // Wait for the dropdown options to appear
  await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });

  const options = page.locator('.va-select-option');
  let targetIndex;
  let selectedOptionText;

  if (instrumentName) {
    // Selection by name
    const optionCount = await options.count();

    // Create array of indices and map to promises that resolve option text
    const optionTexts = await Promise.all(
      /* eslint-disable */
        Array.from({ length: optionCount }, (_, i) => {
          return options.nth(i).textContent().then((text) => cleanDropdownOptionText(text))
        }),
        /* eslint-enable */
    );

    // Find the index of the matching instrument name
    targetIndex = optionTexts.findIndex((text) => text === instrumentName);

    if (targetIndex === -1) {
      throw new Error(`Instrument "${instrumentName}" not found in dropdown options`);
    }

    selectedOptionText = optionTexts[targetIndex];
  } else {
    // Selection by index
    targetIndex = optionIndex;
    const targetOption = options.nth(targetIndex);
    selectedOptionText = cleanDropdownOptionText(await targetOption.textContent());
  }

  // Click the target option
  const targetOption = options.nth(targetIndex);
  await targetOption.click();

  // Verify that the correct value was selected
  if (verify) {
    const selectedValueElement = sourceInstrumentSelect.locator('.va-select-content__option');
    const selectedValue = (await selectedValueElement.textContent()).trim();
    await expect(selectedValue).toBe(selectedOptionText);
  }

  return selectedOptionText;
}

/**
 * Tracks selected files metadata from the upload table
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<Array>} Array of file objects with name and size properties
 */
export async function trackSelectedFilesMetadata({ page }) {
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
 * Asserts that a Select field has the expected value
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the select field
 * @param {string} params.expectedValue - The expected value to be displayed in the select field
 * @returns {Promise<void>}
 */
export async function assertSelectValue({ page, testId, expectedValue }) {
  const selectField = page.getByTestId(testId);
  await expect(selectField).toBeVisible();
  const selectedValueElement = selectField.locator('.va-select-content__option');
  await expect(selectedValueElement).toBeVisible();
  const selectedValue = await selectedValueElement.textContent();
  expect(selectedValue.trim()).toBe(expectedValue);
}

/**
 * Asserts that a checkbox is in the expected state
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the checkbox wrapper
 * @param {boolean} params.expectedState - Whether the checkbox should be checked (true) or unchecked (false)
 * @returns {Promise<void>}
 */
export async function assertCheckboxState({ page, testId, expectedState }) {
  const checkboxWrapper = page.getByTestId(testId);
  await expect(checkboxWrapper).toBeVisible();
  const checkbox = checkboxWrapper.locator('input[type="checkbox"]');
  
  if (expectedState) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

/**
 * Asserts that an autocomplete field is empty
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the autocomplete field
 * @returns {Promise<void>}
 */
export async function assertAutoCompleteEmpty({ page, testId }) {
  const inputField = page.getByTestId(testId);
  await expect(inputField).toHaveValue('');
}

/**
 * Clears an autocomplete field value using the reset button
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the field container
 * @param {boolean} [params.verify=false] - Whether to verify the field was cleared
 * @returns {Promise<void>}
 */
export async function clearAutoComplete({ page, testId, verify = false }) {
  const resetButton = page.locator(`[data-testid="${testId}--container"] [aria-label="reset"]`);
  await expect(resetButton).toBeVisible();
  await resetButton.click();

  if (verify) {
    await assertAutoCompleteEmpty({ page, testId });
  }
}

/**
 * Navigates to the next step in the upload process
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<void>}
 */
export async function navigateToNextStep({ page }) {
  const nextButton = page.getByTestId('upload-next-button');
  await expect(nextButton).toBeVisible();
  await nextButton.click();
}

/**
 * Navigates to the previous step in the upload process
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @returns {Promise<void>}
 */
export async function navigateToPreviousStep({ page }) {
  const previousButton = page.getByTestId('upload-previous-button');
  await expect(previousButton).toBeVisible();
  await previousButton.click();
}

/**
 * Fills in the dataset name in the upload details step
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.datasetName - The dataset name to enter
 * @param {boolean} [params.verify=false] - Whether to verify the name was entered correctly
 * @returns {Promise<void>}
 */
export async function fillDatasetName({ page, datasetName, verify = false }) {
  const datasetNameInput = page.getByTestId('upload-details-dataset-name-input');
  await expect(datasetNameInput).toBeVisible();
  await datasetNameInput.fill(datasetName);

  if (verify) {
    await expect(datasetNameInput).toHaveValue(datasetName);
  }
}

/**
 * Selects files for upload
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string[]} params.filePaths - Array of file paths to upload
 * @returns {Promise<void>}
 */
export async function selectFiles({ page, filePaths }) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-testid="upload-file-select"]'),
  ]);
  await fileChooser.setFiles(filePaths);
}

/**
 * Verifies that a step button is enabled or disabled
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} params.stepIndex - The step index (0-based)
 * @param {boolean} params.shouldBeEnabled - Whether the button should be enabled
 * @returns {Promise<void>}
 */
export async function verifyStepButtonState({ page, stepIndex, shouldBeEnabled }) {
  const stepButton = page.getByTestId(`step-button-${stepIndex}`);
  await expect(stepButton).toBeVisible();
  
  if (shouldBeEnabled) {
    await expect(stepButton).not.toBeDisabled();
  } else {
    await expect(stepButton).toBeDisabled();
  }
}

/**
 * Verifies that form validation errors are displayed
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.errorMessage - The expected error message
 * @param {string} [params.errorSelector] - Custom selector for the error element
 * @returns {Promise<void>}
 */
export async function verifyFormError({ page, errorMessage, errorSelector = '.va-text-danger' }) {
  const errorElement = page.locator(errorSelector);
  await expect(errorElement).toBeVisible();
  await expect(errorElement).toHaveText(errorMessage);
}

module.exports = {
  selectDatasetType,
  selectSourceRawData,
  selectProject,
  selectSourceInstrument,
  trackSelectedFilesMetadata,
  assertSelectValue,
  assertCheckboxState,
  assertAutoCompleteEmpty,
  clearAutoComplete,
  navigateToNextStep,
  navigateToPreviousStep,
  fillDatasetName,
  selectFiles,
  verifyStepButtonState,
  verifyFormError,
};
