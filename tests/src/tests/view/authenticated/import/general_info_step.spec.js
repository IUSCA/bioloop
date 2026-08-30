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


/**
 * Navigate from the Select Directory step to the General Info step.
 *
 * Each test starts with a fresh Page instance, so the setup required to reach
 * General Info must be repeated for every test instead of depending on state
 * created by a previous test.
 *
 * Returns false when there are no import directories available in the current
 * test environment so the calling test can be skipped.
 */

const navigateToGeneralInfo = async (page) => {
  await page.goto('/datasets/import');

  await page.waitForSelector(
    '[data-testid="import-source-select"] .va-select-content__option',
  );

  await page.click(
    `input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`,
  );

  await page.waitForSelector(
    `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
    { timeout: 15000 },
  );

  const results = page.locator(
    `[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
  );

  if ((await results.count()) === 0) {
    return false;
  }

  await results.first().click();

  await expect(
    page.getByTestId(NEXT_BUTTON_TEST_ID),
  ).toBeEnabled();

  await navigateToNextStep({
    page,
    nextButtonTestId: NEXT_BUTTON_TEST_ID,
  });

  await expect(
    page.getByTestId('import-metadata-dataset-type-select'),
  ).toBeVisible();

  return true;
};

const NEXT_BUTTON_TEST_ID = 'import-next-button';
const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const defaultDatasetType = 'Data Product';

test.describe('Dataset Import — General Info step', () => {
  test(
    'should proceed to General Info step after directory is selected',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

      await expect(
        page.getByTestId('import-metadata-dataset-type-select'),
      ).toBeVisible();
    },
  );

  test(
    'should display General Info form fields in their default states',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

      // Dataset Type select is visible with default value
      const datasetTypeSelect = page.getByTestId(
        'import-metadata-dataset-type-select',
      );
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

      // Assign Source Instrument checkbox is checked by default (if instruments available)
      const sourceInstrumentSelect = page.getByTestId(
        'import-metadata-source-instrument-select',
      );
      await expect(sourceInstrumentSelect).toBeVisible();
    },
  );

  test(
    'should allow selecting values in the General Info form fields',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );

  test(
    'should allow clearing values in the General Info form fields',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );

  test(
    'should disable and clear Source Raw Data when Dataset Type changes to Raw Data',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );

  test(
    'should disable and clear Source Raw Data when Assign Source Raw Data is unchecked',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );

  test(
    'should disable and clear Project when Assign Project is unchecked',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );

  test(
    'should disable and clear Source Instrument when Assign Source Instrument is unchecked',
    async ({ page }) => {
      const reachedGeneralInfo = await navigateToGeneralInfo(page);

      test.skip(
        !reachedGeneralInfo,
        'No import directories available in test environment',
      );

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
    },
  );
});