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
        return options.nth(i).textContent().then((text) => cleanDropdownOptionText)
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
 * @returns {Promise<void>}
 */
export async function selectProject({ page, resultIndex = 0 }) {
  const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
  await expect(projectSearchInput).toBeVisible();

  // Click the input field, which will trigger the Project search
  await page.click('input[data-testid="upload-metadata-project-autocomplete"]');

  // Select the search result at the specified index
  await page.getByTestId(`upload-metadata-project-autocomplete--search-result-li-${resultIndex}`).click();
}

/**
 * Selects a source instrument from the dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.instrumentName] - The instrument name to select
 * @param {number} [params.optionIndex] - The index of the option to select (0-based)
 * @returns {Promise<string>} The text of the selected option
 */
export async function selectSourceInstrument({ page, instrumentName, optionIndex }) {
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
          return options.nth(i).textContent().then((text) => cleanDropdownOptionText)
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
  const selectedValueElement = sourceInstrumentSelect.locator('.va-select-content__option');
  const selectedValue = (await selectedValueElement.textContent()).trim();
  await expect(selectedValue).toBe(selectedOptionText);

  return selectedOptionText;
}

module.exports = {
  selectDatasetType,
  selectSourceRawData,
};
