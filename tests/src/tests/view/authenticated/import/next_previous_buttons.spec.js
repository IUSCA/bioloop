import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const NEXT_BUTTON_TEST_ID = 'import-next-button';
const PREVIOUS_BUTTON_TEST_ID = 'import-previous-button';
const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';

const navigateToSelectDirectory = async (page) => {
  await page.goto('/datasets/import');

  // Wait for import sources to load, then verify the dropdown has a selection
  await page.waitForSelector(
    '[data-testid="import-source-select"] .va-select-content__option',
  );
};

const selectFirstDirectory = async (page) => {
  // Attempt to open the file typeahead and select a directory.
  // This test is skipped if no directories are available in the test environment.
  await page.click(
    `input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`,
  );

  // Wait for either loading to start or results to appear
  await page.waitForSelector(
    `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"], ` +
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul__loading"]`,
  );

  // Wait for the loading indicator to clear and the actual results to appear
  await page.waitForSelector(
    `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
    { timeout: 15000 },
  );

  const hasResults =
    (await page
      .locator(
        `[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
      )
      .count()) > 0;

  if (!hasResults) {
    return false;
  }

  // Select the first result
  await page
    .getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`)
    .click();

  return true;
};

const navigateToGeneralInfo = async (page) => {
  await navigateToSelectDirectory(page);

  const hasDirectory = await selectFirstDirectory(page);

  if (!hasDirectory) {
    return false;
  }

  await expect(
    page.getByTestId(NEXT_BUTTON_TEST_ID),
  ).toBeEnabled();

  await navigateToNextStep({
    page,
    nextButtonTestId: NEXT_BUTTON_TEST_ID,
  });

  // Wait for General Info step to load
  await page.waitForSelector(
    '[data-testid="import-metadata-dataset-type-select"]',
  );

  return true;
};

test.describe('Dataset Import — Next/Previous buttons', () => {
  test(
    'should show Previous as disabled and Next as disabled on page load',
    async ({ page }) => {
      await navigateToSelectDirectory(page);

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeDisabled();

      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should keep Next disabled when import source is selected but no directory chosen',
    async ({ page }) => {
      await navigateToSelectDirectory(page);

      // The import source is auto-selected on mount; Next should still be disabled
      // because no directory has been selected yet
      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should enable Next after a directory is selected',
    async ({ page }) => {
      await navigateToSelectDirectory(page);

      const hasDirectory = await selectFirstDirectory(page);

      test.skip(
        !hasDirectory,
        'No import directories available in test environment',
      );

      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeEnabled();

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show Previous as enabled and Next as disabled when no fields are filled',
    async ({ page }) => {
      const onGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !onGeneralInfo,
        'Could not reach General Info step',
      );

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeEnabled();

      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show Next as enabled after filling the form',
    async ({ page }) => {
      const onGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !onGeneralInfo,
        'Could not reach General Info step',
      );

      // Select source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        resultIndex: 0,
      });

      // Select Project
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-project-autocomplete',
        resultIndex: 0,
      });

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'import-metadata-source-instrument-select',
        optionIndex: 0,
      });

      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeEnabled();

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeEnabled();
    },
  );
});
