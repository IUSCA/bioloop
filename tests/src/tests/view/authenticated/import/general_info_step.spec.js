import {
  assertAutoCompleteHasValue,
  assertAutoCompleteState,
  assertCheckboxState,
  assertSelectHasValue,
  assertSelectState,
  assertSelectValue,
  clearAutoComplete,
  selectAutocompleteResult,
  selectDropdownOption,
  setCheckboxState,
} from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const NEXT_BUTTON_TEST_ID = 'import-next-button';
const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const defaultDatasetType = 'Data Product';

test.describe.serial('Dataset Import — General Info step', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasets/import');
  });

  test.describe('Select Directory step setup', () => {
    test.beforeAll(async () => {
      // Wait for import sources to load
      await page.waitForSelector('[data-testid="import-source-select"] .va-select-content__option');

      // Open the file typeahead
      await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);

      // Wait for results to load
      await page.waitForSelector(
        `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
        { timeout: 15000 },
      );

      const hasResults = await page
        .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
        .count() > 0;

      if (!hasResults) {
        return;
      }

      // Select the first directory
      await page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`).click();
    });

    test('should proceed to General Info step after directory is selected', async () => {
      const nextEnabled = await page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled();
      test.skip(!nextEnabled, 'No import directories available in test environment');

      await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
      await page.waitForSelector('[data-testid="import-metadata-dataset-type-select"]');
    });
  });

  test.describe('General Info step fields', () => {
    test('should display General Info form fields in their default states', async () => {
      const nextEnabled = await page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled() === false
        && await page.locator('[data-testid="import-metadata-dataset-type-select"]').isVisible();

      // Dataset Type select is visible with default value
      const datasetTypeSelect = page.getByTestId('import-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      await assertSelectValue({
        page,
        testId: 'import-metadata-dataset-type-select',
        expectedValue: defaultDatasetType,
      });

      // Assign Source Raw Data checkbox is checked by default
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: true,
      });

      // Source Raw Data autocomplete is empty
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-dataset-autocomplete',
      });

      // Assign Project checkbox is checked by default
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-project-checkbox',
        state: true,
      });

      // Project autocomplete is empty
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-project-autocomplete',
      });

      // Assign Source Instrument checkbox is checked by default (if
      // instruments available)
      const sourceInstrumentSelect = page.getByTestId('import-metadata-source-instrument-select');
      await expect(sourceInstrumentSelect).toBeVisible();
    });

    test('should allow selecting values in the General Info form fields', async () => {
      // Change Dataset Type to Raw Data
      await selectDropdownOption({
        page,
        testId: 'import-metadata-dataset-type-select',
        optionToSelect: 'Raw Data',
        verify: true,
      });

      // Reset Dataset Type to default
      await selectDropdownOption({
        page,
        testId: 'import-metadata-dataset-type-select',
        optionToSelect: defaultDatasetType,
        verify: true,
      });

      // Select source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        verify: true,
      });

      // Select Project
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-project-autocomplete',
        verify: true,
      });

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'import-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });
    });

    test('should allow clearing values in the General Info form fields', async () => {
      await clearAutoComplete({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        verify: true,
      });

      await clearAutoComplete({
        page,
        testId: 'import-metadata-project-autocomplete',
        verify: true,
      });
    });

    test('should disable and clear Source Raw Data when Dataset Type changes to Raw Data', async () => {
      // Verify the Assign Source Raw Data checkbox is enabled
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: true,
      });

      // Verify Source Raw Data autocomplete is empty
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-dataset-autocomplete',
      });

      // Select a source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        verify: true,
      });

      // Change Dataset Type to Raw Data
      await selectDropdownOption({
        page,
        testId: 'import-metadata-dataset-type-select',
        optionToSelect: 'Raw Data',
        verify: true,
      });

      // Assign Source Raw Data checkbox should now be unchecked
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: false,
      });

      // Source Raw Data autocomplete should be cleared
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-dataset-autocomplete',
      });

      // Source Raw Data autocomplete should be disabled
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        disabled: true,
      });
    });

    test('should disable and clear Source Raw Data when Assign Source Raw Data is unchecked', async () => {
      // Reset Dataset Type to Data Product so Source Raw Data can be assigned
      await selectDropdownOption({
        page,
        testId: 'import-metadata-dataset-type-select',
        optionToSelect: defaultDatasetType,
        verify: true,
      });

      // Verify checkbox is enabled
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: true,
      });

      // Verify autocomplete is enabled
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        disabled: false,
      });

      // Select a source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        verify: true,
      });

      // Uncheck the Assign Source Raw Data checkbox
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: false,
        verify: true,
      });

      // Autocomplete should be cleared
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-dataset-autocomplete',
      });

      // Autocomplete should be disabled
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        disabled: true,
      });

      // Re-check the checkbox
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: true,
        verify: true,
      });

      // Autocomplete should be enabled again
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-dataset-autocomplete',
        disabled: false,
      });
    });

    test('should disable and clear Project when Assign Project is unchecked', async () => {
      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-project-checkbox',
        state: true,
      });

      // Select a project
      await selectAutocompleteResult({
        page,
        testId: 'import-metadata-project-autocomplete',
        verify: true,
      });

      // Uncheck the Assign Project checkbox
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-project-checkbox',
        state: false,
        verify: true,
      });

      // Project autocomplete should be cleared
      await assertAutoCompleteHasValue({
        page,
        testId: 'import-metadata-project-autocomplete',
      });

      // Project autocomplete should be disabled
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-project-autocomplete',
        disabled: true,
      });

      // Re-check the checkbox
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-project-checkbox',
        state: true,
        verify: true,
      });

      // Project autocomplete should be enabled again
      await assertAutoCompleteState({
        page,
        testId: 'import-metadata-project-autocomplete',
        disabled: false,
      });
    });

    test('should disable and clear Source Instrument when Assign Source Instrument is unchecked', async () => {
      // Select a Source Instrument first
      await selectDropdownOption({
        page,
        testId: 'import-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });

      await assertCheckboxState({
        page,
        testId: 'import-metadata-assign-instrument-checkbox',
        state: true,
      });

      // Instrument select should have a value
      await assertSelectHasValue({
        page,
        testId: 'import-metadata-source-instrument-select',
        hasValue: true,
      });

      // Uncheck the Assign Source Instrument checkbox
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-instrument-checkbox',
        state: false,
        verify: true,
      });

      // Source Instrument select should be disabled
      await assertSelectState({
        page,
        testId: 'import-metadata-source-instrument-select',
        disabled: true,
      });

      // Source Instrument select should be cleared
      await assertSelectHasValue({
        page,
        testId: 'import-metadata-source-instrument-select',
        hasValue: false,
      });
    });
  });
});
