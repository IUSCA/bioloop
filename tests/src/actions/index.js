import { expect } from '@playwright/test';

/**
 * Selects a result from an autocomplete dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {number} [params.resultIndex=0] - The index of the search result to select (0-based)
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string|void>} The text of the selected option if verify is true, otherwise void
 */
export async function selectAutocompleteResult({ 
  page,
  testId,
  resultIndex = 0,
  verify = false,
}) {
  // Validate that resultIndex is provided
  if (resultIndex == null) {
    throw new Error('Must provide resultIndex parameter');
  }

  const searchInput = page.getByTestId(testId);
  await expect(searchInput).toBeVisible();

  // Click the input field, which will trigger the Project search
  await page.click(`input[data-testid="${testId}"]`);

  // Capture the text of the search result before clicking it
  const searchResultLocator = page.getByTestId(`${testId}--search-result-li-${resultIndex}`);
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
    const inputElement = page.locator(`input[data-testid="${testId}"]`);
    await expect(inputElement).toHaveValue(selectedOptionText);
    return selectedOptionText;
  }
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

