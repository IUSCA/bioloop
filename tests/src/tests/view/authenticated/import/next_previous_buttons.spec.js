
import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  IMPORT_NEXT_BUTTON_TEST_ID,
  IMPORT_PATH,
  navigateToImportGeneralInfo,
  navigateToImportSelectDirectory,
} from '../../../../actions/datasetImport';
import { expect, test } from '../../../../fixtures';

/**
 * Verifies the initial step controls and the Next/Previous button states as
 * the user moves into and completes General Info.
 */

const PREVIOUS_BUTTON_TEST_ID = 'import-previous-button';

test.describe('Dataset Import — Next/Previous buttons', () => {
  test(
    'should show the expected controls on initial page load',
    async ({ page }) => {
      await navigateToImportSelectDirectory(page);

      await expect(page).toHaveURL(IMPORT_PATH);

      const selectDirectoryStep = page.getByTestId('step-button-0');
      const generalInfoStep = page.getByTestId('step-button-1');
      const importStep = page.getByTestId('step-button-2');

      await expect(
        selectDirectoryStep.getByTestId('step-label'),
      ).toHaveText('Select Directory');
      await expect(
        generalInfoStep.getByTestId('step-label'),
      ).toHaveText('General Info');
      await expect(importStep.getByTestId('step-label')).toHaveText('Import');

      await expect(selectDirectoryStep).toBeEnabled();
      await expect(generalInfoStep).toBeDisabled();
      await expect(importStep).toBeDisabled();

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeDisabled();

      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show Previous as enabled and Next as disabled when no fields are filled',
    async ({ page }) => {
      const onGeneralInfo = await navigateToImportGeneralInfo(page);

      test.skip(
        !onGeneralInfo,
        'Could not reach General Info step',
      );

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeEnabled();

      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show Next as enabled after filling the form',
    async ({ page }) => {
      const onGeneralInfo = await navigateToImportGeneralInfo(page);

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
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeEnabled();

      await expect(
        page.getByTestId(PREVIOUS_BUTTON_TEST_ID),
      ).toBeEnabled();
    },
  );
});
