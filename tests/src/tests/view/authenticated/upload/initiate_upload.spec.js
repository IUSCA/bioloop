import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  selectFiles,
} from '../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let uploadedDatasetName;
  let selectedDatasetType;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasets/uploads/new');
  });

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });

      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.trim();

      // Select source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Project
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });

      // Navigate to next step
      await navigateToNextStep({ page });

      // Set the name of the dataset being uploaded
      const token = await page.evaluate(() => localStorage.getItem('token'));
      uploadedDatasetName = await generateUniqueDatasetName({
        requestContext: page.request,
        token,
        type: selectedDatasetType,
      });

      // console.log('using dataset name', uploadedDatasetName);
      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      // Click the "Upload" button
      await page.getByTestId('upload-next-button').click();
    });

    // Assert that "Processing" status is shown when Upload button is clicked
    // (to indicate that checksum-computation is in progress)
    test('Should show `Processing` status when Upload button is clicked', async () => {
      const statusRow = page.getByTestId('status-row');
      await expect(statusRow).toBeVisible();
      const processingChip = statusRow.getByTestId('chip-processing');
      const uploadingChip = statusRow.getByTestId('chip-uploading');
      await expect(processingChip.or(uploadingChip)).toBeVisible();
    });

    // Assert that after checksum-computation is complete, "Uploading" status
    // is shown
    test('Should show `Uploading` status after checksum-computation is complete', async () => {
      const statusRow = page.getByTestId('status-row');
      await expect(statusRow).toBeVisible();
      const statusChip = statusRow.getByTestId('chip-uploading');
      await expect(statusChip).toBeVisible();
      await expect(statusChip).toHaveText('Uploading');
    });

    test('should show upload status after submission starts', async () => {
      const processingChip = page.getByTestId('chip-processing');
      const uploadingChip = page.getByTestId('chip-uploading');
      const uploadedChip = page.getByTestId('chip-uploaded');
      const failedChip = page.getByTestId('chip-upload-failed');

      await expect(
        processingChip.or(uploadingChip).or(uploadedChip).or(failedChip),
      ).toBeVisible();
    });
  });
});
