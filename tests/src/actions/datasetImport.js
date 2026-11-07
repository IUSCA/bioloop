import {
  selectAutocompleteResult,
  selectDropdownOption,
} from './index';
import { navigateToNextStep } from './stepper';

const { expect } = require('../fixtures');

export const IMPORT_PATH = '/datasets/import';
export const IMPORT_SOURCE_TEST_ID = 'import-source-select';
export const IMPORT_FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
export const IMPORT_NEXT_BUTTON_TEST_ID = 'import-next-button';

/**
 * Opens the import page and waits for its sources to load.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function navigateToImportSelectDirectory(page) {
  await page.goto(IMPORT_PATH);
  await page.waitForSelector(
    `[data-testid="${IMPORT_SOURCE_TEST_ID}"] .va-select-content__option`,
  );
}

/**
 * Opens the directory autocomplete and waits until loading has completed.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function openImportDirectoryTypeahead(page) {
  await page.click(
    `input[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}"]`,
  );

  await page.waitForSelector(
    `[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"], `
      + `[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul__loading"]`,
  );

  await page.waitForSelector(
    `[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
    { timeout: 15000 },
  );
}

/**
 * Selects the first available import directory.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} false when the environment has no directories
 */
export async function selectFirstImportDirectory(page) {
  await openImportDirectoryTypeahead(page);

  const results = page.locator(
    `[data-testid^="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
  );

  if ((await results.count()) === 0) {
    return false;
  }

  await results.first().click();
  return true;
}

/**
 * Navigates from Select Directory to General Info.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} false when the environment has no directories
 */
export async function navigateToImportGeneralInfo(page) {
  await navigateToImportSelectDirectory(page);

  if (!(await selectFirstImportDirectory(page))) {
    return false;
  }

  await expect(page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID)).toBeEnabled();
  await navigateToNextStep({
    page,
    nextButtonTestId: IMPORT_NEXT_BUTTON_TEST_ID,
  });
  await expect(
    page.getByTestId('import-metadata-dataset-type-select'),
  ).toBeVisible();

  return true;
}

/**
 * Navigates through General Info using the first available metadata values.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} false when an earlier step cannot be reached
 */
export async function navigateToImportDetails(page) {
  if (!(await navigateToImportGeneralInfo(page))) {
    return false;
  }

  await selectAutocompleteResult({
    page,
    testId: 'import-metadata-dataset-autocomplete',
    resultIndex: 0,
    verify: true,
  });
  await selectAutocompleteResult({
    page,
    testId: 'import-metadata-project-autocomplete',
    resultIndex: 0,
    verify: true,
  });
  await selectDropdownOption({
    page,
    testId: 'import-metadata-source-instrument-select',
    optionIndex: 0,
  });

  await navigateToNextStep({
    page,
    nextButtonTestId: IMPORT_NEXT_BUTTON_TEST_ID,
  });

  return page.getByTestId('import-info-card').isVisible();
}
