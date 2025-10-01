import { expect, test } from '../../../../fixtures';

import {
  clearAutoComplete,
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';

import {
  selectFiles,
} from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';

const attachments = Array.from({ length: 1 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test('should show the Previous button as disabled and Next button as enabled on page load', async () => {
    // Check the Previous button
    const previousButton = page.getByTestId('upload-previous-button');
    await expect(previousButton).toBeDisabled();

    // Check the Next button
    const nextButton = page.getByTestId('upload-next-button');
    await expect(nextButton).toBeDisabled();
  });

  test.describe('should show the Next button as enabled after a file is selected', async () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
    });

    test('should show the Next button as enabled', async () => {
      // Wait for the file to be processed
      await page.waitForSelector('[data-testid="upload-selected-files-table"]');

      // Check if the Next button is now enabled
      const nextButton = page.getByTestId('upload-next-button');
      await expect(nextButton).toBeEnabled();

      // Check if the Previous button is still disabled
      const previousButton = page.getByTestId('upload-previous-button');
      await expect(previousButton).toBeDisabled();
    });
  });

  test.describe('should show the Previous button enabled and Next button disabled on the `General Info` step', async () => {
    test.beforeAll(async () => {
      // Click the Next button to move to the General-Info step
      await navigateToNextStep({ page });
    });

    test('should show the Previous button as enabled and Next button disabled', async () => {
      // Wait for the General Info step to load
      await page.waitForSelector('[data-testid="upload-metadata-dataset-type-select"]');

      await Promise.all([
        // Check if the Previous button is now enabled
        expect(page.getByTestId('upload-previous-button')).toBeEnabled(),

        // Check if the Next button is disabled (as no selections have been
        // made yet in the General-Info form)
        expect(page.getByTestId('upload-next-button')).toBeDisabled(),
      ]);
    });
  });

  test.describe('should show the Next button as enabled after General-Info step\'s form fields are filled', async () => {
    test.beforeAll(async () => {
      // Wait for the General Info step to load
      await page.waitForSelector('[data-testid="upload-metadata-dataset-type-select"]');

      // Select source Raw Data
      await selectAutocompleteResult({ page, testId: 'upload-metadata-dataset-autocomplete', resultIndex: 0 });

      // Select Project
      await selectAutocompleteResult({ page, testId: 'upload-metadata-project-autocomplete', resultIndex: 0 });

      // Select Source Instrument
      await selectDropdownOption({ page, testId: 'upload-metadata-source-instrument-select', optionIndex: 0 });
    });

    test('should show the Next button as enabled after filling the form', async () => {
      // Check if the Next button is now enabled
      const nextButton = page.getByTestId('upload-next-button');
      await expect(nextButton).toBeEnabled();

      // check if the Previous button is still enabled
      const previousButton = page.getByTestId('upload-previous-button');
      await expect(previousButton).toBeEnabled();
    });

    test('should show the Next button as disabled if either of the `Source Raw Data` or `Project` fields are cleared ', async () => {
      // Clear Source Raw Data and check Next/Previous buttons
      await clearAutoComplete({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
      });
      // check buttons
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();
      await expect(page.getByTestId('upload-previous-button')).toBeEnabled();

      // Refill Raw Data
      await selectAutocompleteResult({ page, testId: 'upload-metadata-dataset-autocomplete', resultIndex: 0 });
      // check buttons again
      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      await expect(page.getByTestId('upload-previous-button')).toBeEnabled();

      // Clear Project and check Next/Previous buttons
      await clearAutoComplete({
        page,
        testId: 'upload-metadata-project-autocomplete',
      });
      // check buttons
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();
      await expect(page.getByTestId('upload-previous-button')).toBeEnabled();

      // Refill Project
      await selectAutocompleteResult({ page, testId: 'upload-metadata-project-autocomplete', resultIndex: 0 });
      // check buttons again
      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      await expect(page.getByTestId('upload-previous-button')).toBeEnabled();
    });
  });
});
