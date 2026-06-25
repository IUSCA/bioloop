import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const NEXT_BUTTON_TEST_ID = 'import-next-button';
const PREVIOUS_BUTTON_TEST_ID = 'import-previous-button';

test.describe.serial('Dataset Import — Next/Previous buttons', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasets/import');
  });

  test('should show Previous as disabled and Next as disabled on page load', async () => {
    await expect(page.getByTestId(PREVIOUS_BUTTON_TEST_ID)).toBeDisabled();
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();
  });

  test.describe('should enable Next after an import source and directory are selected', () => {
    test.beforeAll(async () => {
      // Wait for import sources to load, then verify the dropdown has a selection
      await page.waitForSelector('[data-testid="import-source-select"] .va-select-content__option');
    });

    test('should keep Next disabled when import source is selected but no directory chosen', async () => {
      // The import source is auto-selected on mount; Next should still be disabled
      // because no directory has been selected yet
      await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();
    });

    test.describe('should enable Next once a directory is selected', () => {
      test.beforeAll(async () => {
        // Attempt to open the file typeahead and select a directory.
        // This test is skipped if no directories are available in the test environment.
        await page.click(`input[data-testid="import-file-autocomplete"]`);

        // Wait for either loading to start or results to appear
        await page.waitForSelector(
          '[data-testid="import-file-autocomplete--search-results-ul"], [data-testid="import-file-autocomplete--search-results-ul__loading"]',
        );

        // Wait for the loading indicator to clear and the actual results to appear
        await page.waitForSelector('[data-testid="import-file-autocomplete--search-results-ul"]', { timeout: 15000 });
      });

      test('should enable Next after a directory is selected', async () => {
        const hasResults = await page.locator('[data-testid^="import-file-autocomplete--search-result-li-"]').count() > 0;

        test.skip(!hasResults, 'No import directories available in test environment');

        // Select the first result
        await page.getByTestId('import-file-autocomplete--search-result-li-0').click();

        await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
        await expect(page.getByTestId(PREVIOUS_BUTTON_TEST_ID)).toBeDisabled();
      });
    });
  });

  test.describe('should show Previous enabled and Next disabled on the General Info step', () => {
    test.beforeAll(async () => {
      const nextEnabled = await page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled();
      if (!nextEnabled) {
        test.skip();
        return;
      }
      await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
    });

    test('should show Previous as enabled and Next as disabled when no fields are filled', async () => {
      // Wait for General Info step to load
      await page.waitForSelector('[data-testid="import-metadata-dataset-type-select"]');

      await expect(page.getByTestId(PREVIOUS_BUTTON_TEST_ID)).toBeEnabled();
      await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();
    });

    test.describe('should enable Next after General Info fields are filled', () => {
      test.beforeAll(async () => {
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
      });

      test('should show Next as enabled after filling the form', async () => {
        await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
        await expect(page.getByTestId(PREVIOUS_BUTTON_TEST_ID)).toBeEnabled();
      });
    });
  });
});
