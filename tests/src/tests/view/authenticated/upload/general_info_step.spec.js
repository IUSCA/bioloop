import { expect, test } from '../../../../fixtures';

import {
  assertAutoCompleteDisabled,
  assertAutoCompleteEmpty,
  assertCheckboxState,
  assertSelectValue,
  clearAutoComplete,
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  selectFiles,
} from '../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../actions/stepper';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

const defaultDatasetType = 'Data Product';

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe('General Info step', async () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
    });

    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the General-Info step
      await navigateToNextStep({ page });
    });

    test('should display General-Info form fields in their default states, with their default values', async () => {
      // Wait for the Dataset Type row to be visible
      const datasetTypeRow = page.getByTestId('upload-metadata-dataset-type-row');
      await expect(datasetTypeRow).toBeVisible();
      // Find the Dataset Type select widget within the row and verify it's
      // visible
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Assert the default value
      await assertSelectValue({
        page,
        testId: 'upload-metadata-dataset-type-select',
        expectedValue: defaultDatasetType,
      });

      // Verify that the "Assign source Raw Data" row is visible
      const assignSourceRawDataRow = page.getByTestId('upload-metadata-assign-source-row');
      await expect(assignSourceRawDataRow).toBeVisible();
      // Verify that the 'Assign source Raw Data' checkbox is checked by default
      await assertCheckboxState({
        page,
        testId: 'upload-metadata-assign-source-checkbox',
        expectedState: true,
      });
      // Verify that the 'Search Raw Data' input field is empty
      await assertAutoCompleteEmpty({ page, testId: 'upload-metadata-dataset-autocomplete' });

      // Verify that the "Assign Project" row is visible
      const assignProjectRow = page.getByTestId('upload-metadata-assign-project-row');
      await expect(assignProjectRow).toBeVisible();

      // Verify that the 'Assign Project' checkbox is checked by default
      await assertCheckboxState({
        page,
        testId: 'upload-metadata-assign-project-row',
        expectedState: true,
        isRowContainer: true,
      });
      // Verify that the 'Search Projects' input field is empty
      await assertAutoCompleteEmpty({ page, testId: 'upload-metadata-project-autocomplete' });

      // Verify that the "Assign source Instrument" row is visible
      const assignInstrumentRow = page.getByTestId('upload-metadata-assign-instrument-row');
      await expect(assignInstrumentRow).toBeVisible();
      // Verify that the 'Assign source Instrument' checkbox is checked by
      // default
      await assertCheckboxState({
        page,
        testId: 'upload-metadata-assign-instrument-row',
        expectedState: true,
        isRowContainer: true,
      });
      // Verify that the 'Source Instrument' select field is visible and has the
      // correct placeholder
      const sourceInstrumentSelect = assignInstrumentRow.locator('.va-select__anchor');
      await expect(sourceInstrumentSelect).toBeVisible();
      // Verify that no value is selected in the Source Instrument dropdown
      const selectedOption = sourceInstrumentSelect.locator('.va-select-content__option');
      await expect(selectedOption).toHaveCount(0);
    });

    test('should allow selecting values in the General-Info step\'s fields', async () => {
      // Change selected Dataset Type to Raw Data
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-dataset-type-select',
        optionToSelect: 'Raw Data',
        verify: true,
      });

      // Reset selected Dataset Type to its default value
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-dataset-type-select',
        optionToSelect: defaultDatasetType,
        verify: true,
      });

      // Select source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        verify: true,
      });

      // Select Project
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        verify: true,
      });

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });
    });

    test('should allow clearing values in the General-Info step\'s fields', async () => {
      // Clear Source Raw Data
      await clearAutoComplete({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        verify: true,
      });

      // Clear Project
      await clearAutoComplete({
        page,
        testId: 'upload-metadata-project-autocomplete',
        verify: true,
      });
    });

    test('should disable and clear `Source Raw Data` field when `Dataset Type` is changed to "Raw Data"', async () => {
      // assert that the `Source Raw Data` checkbox is enabled
      await assertCheckboxState({
        page,
        testId: 'upload-metadata-assign-source-checkbox',
        expectedState: true,
      });

      // assert that the `Source Raw Data` input field is empty
      await assertAutoCompleteEmpty({ page, testId: 'upload-metadata-dataset-autocomplete' });

      // select an option in the `Source Raw Data` input field
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        verify: true,
      });

      // Change selected Dataset Type to Raw Data
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-dataset-type-select',
        optionToSelect: 'Raw Data',
        verify: true,
      });

      // assert that the `Source Raw Data` checkbox is disabled
      await assertCheckboxState({
        page,
        testId: 'upload-metadata-assign-source-checkbox',
        expectedState: false,
      });

      // assert that the `Source Raw Data` input field is empty
      await assertAutoCompleteEmpty({ page, testId: 'upload-metadata-dataset-autocomplete' });

      // assert that the `Source Raw Data` input field is disabled
      await assertAutoCompleteDisabled({ page, testId: 'upload-metadata-dataset-autocomplete' });
    });

    test('should enable the `Source Raw Data` fields when `Dataset Type` is changed to "Data Product"', async () => {
      // todo - add test
    });
  });
});
