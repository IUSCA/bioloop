const { expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

const testIdSelector = (testId) => `[data-testid=${testId}]`;

const elementTestIdSelector = ({ elementType = null, testId }) => (elementType ? `${elementType}${testIdSelector(testId)}` : `div${testIdSelector(testId)}`);

const fillText = async ({ locator, text }) => {
  await locator.fill(text);
};

const fillAndAssertText = async ({
  locator, text,
}) => {
  await fillText({ locator, text });
  await expect(locator).toHaveValue(text);
};

/**
 * Cleans dropdown option text from a Vuestic Select component by removing
 * Vuestic's check icon suffix
 * @param {string} text - The raw text content from a dropdown option
 * @returns {string} The cleaned text without the check icon suffix
 */
function cleanDropdownOptionText(text) {
  // Vuestic inserts a check icon after the dropdown options' text, which
  // will need to be removed. Therefore, remove trailing ' check'
  return text
    .replace(/\s+check$/, '')
    .trim();
}

/**
 * Selects a source instrument from the dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} [params.optionToSelect] - The option to select by name
 * @param {number} [params.optionIndex] - The index of the option to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string>} The text of the selected option
 */
export async function selectDropdownOption({ 
  page,
  testId,
  optionToSelect,
  optionIndex,
  verify = false,
}) {
  // Validate that exactly one selection method is provided
  if ((optionToSelect && optionIndex !== undefined)
      || (!optionToSelect && optionIndex === undefined)) {
    throw new Error('Must provide either optionToSelect or optionIndex, but not both');
  }

  const dropdownSelect = page.getByTestId(testId);
  await expect(dropdownSelect).toBeVisible();

  // Open dropdown
  await dropdownSelect.click();

  // Wait for the dropdown options to appear
  await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });

  const options = page.locator('.va-select-option');
  let targetOptionIndex;
  let selectedOptionText;

  if (optionToSelect) {
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

    // Find the index of the matching option
    targetOptionIndex = optionTexts.findIndex((text) => text === optionToSelect);

    if (targetOptionIndex === -1) {
      throw new Error(`Option "${optionToSelect}" not found in dropdown options`);
    }

    selectedOptionText = optionTexts[targetOptionIndex];
  } else {
    // Selection by index
    targetOptionIndex = optionIndex;
    const targetOption = options.nth(targetOptionIndex);
    selectedOptionText = cleanDropdownOptionText(await targetOption.textContent());
  }

  // Click the target option
  const targetOption = options.nth(targetOptionIndex);
  await targetOption.click();

  // Verify that the correct value was selected
  if (verify) {
    const selectedValueElement = dropdownSelect.locator('.va-select-content__option');
    const selectedValue = (await selectedValueElement.textContent()).trim();
    await expect(selectedValue).toBe(selectedOptionText);
  }

  return selectedOptionText;
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

module.exports = {
  testIdSelector,
  elementTestIdSelector,
  fillText,
  fillAndAssertText,
  cleanDropdownOptionText,
};
