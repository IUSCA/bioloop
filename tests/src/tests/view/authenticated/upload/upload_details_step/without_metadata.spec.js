import { expect, test } from '../../../../../fixtures';

import {
  selectFiles,
  trackSelectedFilesMetadata,
} from '../../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../../actions/stepper';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  let selectedDatasetType;

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe('File selection step', () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files using the selectFiles method
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
    });

    test('Wait for the file upload table to be visible', async () => {
      // Track selected files metadata
      const files = await trackSelectedFilesMetadata({ page });

      // Store the selected files' information in state
      selectedFiles.push(...files);
    });
  });

  test.describe('General-Info selection step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page });
    });

    test('should allow selecting values in the General-Info form\'s fields', async () => {
      // Select (or track, if pre-populated) Dataset Type
      // Capture the pre-populated Dataset Type
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.trim();
    });
  });

  test.describe('Upload-Details step', () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page });
    });

    test('should show all the selected General-Info form\'s fields', async () => {
    // Check Dataset Type
      const datasetTypeChip = page.getByTestId('upload-details-dataset-type-chip');
      await expect(datasetTypeChip).toBeVisible();
      await expect(datasetTypeChip).toHaveText(selectedDatasetType);

      // Check Source Raw Data
      const sourceRawDataLink = page.getByTestId('upload-details-source-raw-data-link');
      await expect(sourceRawDataLink).toBeVisible();
      await expect(sourceRawDataLink).toHaveText('');

      // Check Project
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).toHaveText('');

      // Check Source Instrument
      const sourceInstrumentName = page.getByTestId('upload-details-source-instrument-name');
      await expect(sourceInstrumentName).toBeVisible();
      await expect(sourceInstrumentName).toHaveText('');
    });
  });
});
