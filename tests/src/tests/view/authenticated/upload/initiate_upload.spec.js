import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
} from '../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

function getUploadStatusChip(page, status) {
  return page.getByTestId('status-row').getByTestId(`chip-${status}`);
}

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    await openNewUpload({ page });
  });

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ attachmentManager }) => {
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFilesAndGoToGeneralInfo({ page, filePaths });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      let selectedDatasetType = await datasetTypeSelect
        .locator('.va-select-content__option')
        .textContent();
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
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

      // Set the name of the dataset being uploaded
      const token = await page.evaluate(() => globalThis.localStorage.getItem('token'));
      const uploadedDatasetName = await generateUniqueDatasetName({
        requestContext: page.request,
        token,
        type: selectedDatasetType,
      });

      // console.log('using dataset name', uploadedDatasetName);
      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      // Click the "Upload" button
      await page.getByTestId('upload-next-button').click();
    });

    test('should show `Processing` or `Uploading` after submission starts', async () => {
      const processingChip = getUploadStatusChip(page, 'processing');
      const uploadingChip = getUploadStatusChip(page, 'uploading');

      await expect(processingChip.or(uploadingChip)).toBeVisible();
    });

    test('should show `Uploading` after manifest-hash computation completes', async () => {
      const statusChip = getUploadStatusChip(page, 'uploading');

      await expect(statusChip).toBeVisible();
      await expect(statusChip).toHaveText('Uploading');
    });
  });
});
