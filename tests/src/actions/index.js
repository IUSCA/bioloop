import { cleanDropdownOptionText } from '../utils';

const { expect } = require('../fixtures');

/**
 * Asserts that a Select (dropdown) field has the expected value
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the select field
 * @param {string} params.expectedValue - The expected value to be displayed in the select field
 * @returns {Promise<void>}
 */
export async function assertSelectValue({
  page,
  testId,
  expectedValue,
}) {
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
 * @param {boolean} params.state - Whether the checkbox should be checked (true) or
 * unchecked (false)
 * @returns {Promise<void>}
 */
export async function assertCheckboxState({
  page,
  testId,
  state,
}) {
  if (typeof state !== 'boolean') {
    throw new Error('state must be a boolean');
  }

  if (state == null) {
    throw new Error('state must be provided');
  }

  const checkboxWrapper = page.getByTestId(testId);
  await expect(checkboxWrapper).toBeVisible();
  const checkbox = checkboxWrapper.locator('input[type="checkbox"]');

  const isCurrentlyChecked = (await checkbox.getAttribute('aria-checked')) === 'true';

  expect(isCurrentlyChecked).toBe(state);
}

/**
 * Sets the state of a checkbox
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the checkbox wrapper
 * @param {boolean} params.state - The state to set the checkbox to
 * @param {boolean} [params.verify=false] - Whether to verify the checkbox state was set
 * @returns {Promise<void>}
 */
export async function setCheckboxState({
  page,
  testId,
  state,
  verify = false,
}) {
  if (state == null) {
    throw new Error('state must be provided');
  }

  if (typeof state !== 'boolean') {
    throw new Error('state must be a boolean');
  }

  const checkboxWrapper = page.getByTestId(testId);
  await expect(checkboxWrapper).toBeVisible();
  const checkbox = checkboxWrapper.locator('input[type="checkbox"]');

  const isCurrentlyChecked = (await checkbox.getAttribute('aria-checked')) === 'true';

  // Checkbox should be toggled if:
  // - requested state is 'checked', and checkbox is currently unchecked
  // - requested state is 'unchecked', and checkbox is currently checked
  const shouldToggleCheckboxState = (state && !isCurrentlyChecked)
   || (!state && isCurrentlyChecked);

  if (shouldToggleCheckboxState) {
    const label = checkboxWrapper.locator('label.va-checkbox__label');
    await label.click();
  }

  if (verify) {
    await assertCheckboxState({
      page,
      testId,
      state,
    });
  }
}

/**
 * Selects a result from an Autocomplete dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the autocomplete field
 * @param {number} [params.resultIndex] - The index of the search result to select (0-based)
 * @param {string} [params.resultText] - The text of the search result to select
 * @param {boolean} [params.verify=false] - Whether to verify the selection was successful
 * @returns {Promise<string|void>} The text of the selected option if verify is true, otherwise void
 */
export async function selectAutocompleteResult({
  page,
  testId,
  resultIndex,
  resultText,
  verify = false,
} = {}) {
  let _resultIndex;
  // Validate that exactly one selection method is provided
  if ((resultIndex != null && resultText != null)) {
    throw new Error('Must not provide both resultIndex and resultText');
  }

  // If no selection method is provided, default to the first result
  if (resultIndex == null && resultText == null) {
    _resultIndex = 0;
  }

  const searchInput = page.getByTestId(testId);
  await expect(searchInput).toBeVisible();

  // Click the input field, which will trigger the Project search
  await page.click(`input[data-testid="${testId}"]`);

  // Wait for results to be visible
  await page.waitForSelector(`[data-testid="${testId}--search-results-ul"]`);

  let searchResultLocator;
  let selectedOptionText;

  if (_resultIndex != null) {
    // Selection by index: Directly locate the result at the specified index
    searchResultLocator = page.getByTestId(`${testId}--search-result-li-${_resultIndex}`);
    if (verify) {
      await expect(searchResultLocator).toBeVisible();
      selectedOptionText = (await searchResultLocator.textContent()).trim();
    }
  } else {
    // Selection by text: Find the first matching result by exact text match
    // Get all search result items from the autocomplete dropdown
    const resultItems = await page.locator(`[data-testid^="${testId}--search-result-li-"]`).all();

    let matchingIndex = -1;
    const matchingIndices = [];

    // Iterate through all results to find matches
    for (let i = 0; i < resultItems.length; i += 1) {
      const button = resultItems[i].locator('button');
      /* eslint-disable-next-line no-await-in-loop */
      const text = (await button.textContent()).trim();
      // Check for exact text match
      if (text === resultText) {
        matchingIndices.push(i);
        // Store the first matching index
        if (matchingIndex === -1) {
          matchingIndex = i;
        }
      }
    }

    if (matchingIndex === -1) {
      throw new Error(`No autocomplete result found with text "${resultText}"`);
    }

    // ambiguous selection
    if (matchingIndices.length > 1) {
      throw new Error(`Multiple autocomplete results (${matchingIndices.length}) found with text "${resultText}".`);
    }

    // Use the matching index to locate the result element
    searchResultLocator = page.getByTestId(`${testId}--search-result-li-${matchingIndex}`);
    selectedOptionText = resultText;
  }

  // Select the search result
  await searchResultLocator.click();

  // Verify that the value was selected, if requested
  if (verify) {
    const inputElement = page.locator(`input[data-testid="${testId}"]`);
    await expect(inputElement).toHaveValue(selectedOptionText);
    return selectedOptionText;
  }
}

/**
 * Gets all results from an autocomplete dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the autocomplete field
 * @returns {Promise<string[]>} Array of result texts
 */
export async function getAutoCompleteResults({
  page,
  testId,
}) {
  // Click to open the autocomplete dropdown
  const autocomplete = page.getByTestId(testId);
  await autocomplete.click();

  // Wait for results to appear
  await page.waitForSelector(`[data-testid="${testId}--search-results-ul"]`);

  // Get all result items (excluding the 'Count' li and 'Load More' li)
  const resultItems = await page.locator(`[data-testid^="${testId}--search-result-li-"]`).all();

  // Extract text from each button inside the li elements
  const results = await Promise.all(
    resultItems.map(async (item) => {
      const button = item.locator('button');
      const text = await button.textContent();
      return text.trim();
    }),
  );

  // Click on the help icon of the autocomplete, to close the autocomplete.
  //  - TODO: find a better way to close the autocomplete.
  await page.getByTestId(`${testId}-popover`).click();

  return results;
}

/**
 * Asserts that an autocomplete field has a value
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the autocomplete field
 * @returns {Promise<void>}
 */
export async function assertAutoCompleteHasValue({
  page,
  testId,
}) {
  const inputField = page.getByTestId(testId);
  await expect(inputField).toHaveValue('');
}

/**
 * Asserts that an autocomplete field is in the expected state (disabled or enabled)
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the autocomplete field
 * @param {boolean} [params.disabled=false] - Whether the autocomplete field should be disabled.
 *    If true, the autocomplete field should be enabled.
 *    If false, the autocomplete field should be disabled.
 * @returns {Promise<void>}
 */
export async function assertAutoCompleteState({
  page,
  testId,
  disabled,
} = {}) {
  if (disabled == null) {
    throw new Error('disabled must be provided');
  }

  if (typeof disabled !== 'boolean') {
    throw new Error('disabled must be a boolean');
  }

  const inputField = page.getByTestId(testId);
  if (disabled) {
    await expect(inputField).toBeDisabled();
  } else {
    await expect(inputField).not.toBeDisabled();
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
export async function clearAutoComplete({
  page,
  testId,
  verify = false,
}) {
  const resetButton = page.locator(`[data-testid="${testId}--container"] [aria-label="reset"]`);
  await expect(resetButton).toBeVisible();
  await resetButton.click();

  if (verify) {
    await assertAutoCompleteHasValue({ page, testId });
  }
}

/**
 * Selects a source instrument from the dropdown
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the dropdown
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

  // Verify that the value was selected
  if (verify) {
    const selectedValueElement = dropdownSelect.locator('.va-select-content__option');
    const selectedValue = (await selectedValueElement.textContent()).trim();
    await expect(selectedValue).toBe(selectedOptionText);
    return selectedOptionText;
  }
}

/**
 * Asserts that a select field is in the expected state (disabled or enabled)
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the select field
 * @param {boolean} [params.disabled=false] - Whether the select field should be disabled.
 * @returns {Promise<void>}
 */
export async function assertSelectState({
  page,
  testId,
  disabled,
}) {
  const selectField = page.getByTestId(testId);
  await expect(selectField).toBeVisible();

  if (disabled) {
    await expect(selectField).toBeDisabled();
  } else {
    await expect(selectField).not.toBeDisabled();
  }
}

/**
 * Asserts that a select field has a value
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the select field
 * @param {boolean} params.hasValue - Whether the select field should have a value
 * @returns {Promise<void>}
 */
export async function assertSelectHasValue({ page, testId, hasValue }) {
  const selectField = page.getByTestId(testId);
  const option = selectField.locator('.va-select-content__option');
  const placeholder = selectField.locator('.va-select-content__placeholder');

  if (hasValue) {
    // Ensure option is present and non-empty
    await expect(option).toHaveCount(1);
    await expect(option).not.toHaveText('');
  } else {
    // Ensure no option is present, and placeholder is visible
    await expect(option).toHaveCount(0);
    await expect(placeholder).toBeVisible();
  }
}

/**
 * Fills in the dataset name in the upload details step
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page instance
 * @param {string} params.testId - The test ID of the input field
 * @param {string} params.value - The value to enter into the input field
 * @param {boolean} [params.verify=false] - Whether to verify the name was entered
 * @returns {Promise<void>}
 */
export async function typeInputValue({
  page,
  testId,
  value,
  verify = false,
}) {
  const inputElement = page.getByTestId(testId);
  await expect(inputElement).toBeVisible();
  await inputElement.fill(value);

  if (verify) {
    await expect(inputElement).toHaveValue(value);
  }
}
