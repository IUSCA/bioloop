import {
  selectAutocompleteResult, selectDropdownOption,
} from '../../../../actions';
import {
  selectFiles,
} from '../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const attachments = Array.from({ length: 1 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.beforeAll(async ({ attachmentManager }) => {
    // Select files
    const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
    await selectFiles({ page, filePaths });
  });

  test('should show all steps\' buttons with the correct labels', async () => {
    // Verify the existence of the "Select Files" step button
    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).toBeVisible();
    let labelElement = selectFilesStepButton.getByTestId('step-label');
    await expect(labelElement).toBeVisible();
    expect(await labelElement.textContent()).toBe('Select Files');

    // Verify the existence of the "General Info" step button
    const generalInfoStepButton = page.getByTestId('step-button-1');
    await expect(generalInfoStepButton).toBeVisible();
    labelElement = generalInfoStepButton.getByTestId('step-label');
    await expect(labelElement).toBeVisible();
    expect(await labelElement.textContent()).toBe('General Info');

    // Verify the existence of the "Upload" step button
    const uploadStepButton = page.getByTestId('step-button-2');
    await expect(uploadStepButton).toBeVisible();
    labelElement = uploadStepButton.getByTestId('step-label');
    await expect(labelElement).toBeVisible();
    expect(await labelElement.textContent()).toBe('Upload');
  });

  test.describe('File-selection step', () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
    });

    test('should show only the \'Select Files\' step\'s buttons as enabled', async () => {
      const selectFilesStepButton = page.getByTestId('step-button-0');
      await expect(selectFilesStepButton).not.toBeDisabled();

      const generalInfoStepButton = page.getByTestId('step-button-1');
      await expect(generalInfoStepButton).toBeDisabled();

      const uploadStepButton = page.getByTestId('step-button-2');
      await expect(uploadStepButton).toBeDisabled();
    });
  });

  test.describe('General-Info step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the General-Info step
      await navigateToNextStep({ page });
    });

    test('should show the \'Select Files\' and the \'General Info\' step\'s buttons as enabled', async () => {
      const selectFilesStepButton = page.getByTestId('step-button-0');
      await expect(selectFilesStepButton).not.toBeDisabled();

      const generalInfoStepButton = page.getByTestId('step-button-1');
      await expect(generalInfoStepButton).not.toBeDisabled();

      const uploadStepButton = page.getByTestId('step-button-2');
      await expect(uploadStepButton).toBeDisabled();
    });

    test('should allow selecting values in the General-Info form\'s fields', async () => {
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();

      // Select source Raw Data
      await selectAutocompleteResult({ page, testId: 'upload-metadata-dataset-autocomplete', resultIndex: 0 });

      // Select Project
      await selectAutocompleteResult({ page, testId: 'upload-metadata-project-autocomplete', resultIndex: 0 });

      // Select Source Instrument
      await selectDropdownOption({ page, testId: 'upload-metadata-source-instrument-select', optionIndex: 0 });
    });
  });

  test.describe('Upload-details step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-details step
      await navigateToNextStep({ page });
    });

    test('should show all steps\' buttons as enabled', async () => {
      const selectFilesStepButton = page.getByTestId('step-button-0');
      await expect(selectFilesStepButton).not.toBeDisabled();

      const generalInfoStepButton = page.getByTestId('step-button-1');
      await expect(generalInfoStepButton).not.toBeDisabled();

      const uploadStepButton = page.getByTestId('step-button-2');
      await expect(uploadStepButton).not.toBeDisabled();
    });
  });
});
