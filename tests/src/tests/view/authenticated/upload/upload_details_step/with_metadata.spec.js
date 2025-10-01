import { expect, test } from '../../../../../fixtures';

import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../actions';
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
  let selectedRawDataName;
  let selectedProjectName;
  let selectedInstrumentName;

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

      // Select source Raw Data
      selectedRawDataName = await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Project
      selectedProjectName = await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Source Instrument
      selectedInstrumentName = await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });
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
      await expect(sourceRawDataLink).toHaveText(selectedRawDataName);

      // Check Project
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).toHaveText(selectedProjectName);

      // Check Source Instrument
      const sourceInstrumentName = page.getByTestId('upload-details-source-instrument-name');
      await expect(sourceInstrumentName).toBeVisible();
      await expect(sourceInstrumentName).toHaveText(selectedInstrumentName);

      // Check that Dataset Name input is visible and empty
      const datasetNameInput = page.getByTestId('upload-details-dataset-name-input');
      await expect(datasetNameInput).toBeVisible();
      await expect(datasetNameInput).toHaveValue('');

      // Check that there's an error message for the empty Dataset Name
      // const datasetNameRow =
      // page.getByTestId('upload-details-dataset-name-row'); const
      // datasetNameError =
      // datasetNameRow.locator('.va-text-danger.text-xs.dataset-name-input');
      // await expect(datasetNameError).toBeVisible(); await
      // expect(datasetNameError).toHaveText('Dataset name cannot be empty');
    });

    test('should show all the selected files and their details', async () => {
      // Check if the file upload table is visible
      const fileUploadTable = page.getByTestId('file-upload-table');
      await expect(fileUploadTable).toBeVisible();

      // Get all rows in the table
      const tableRows = fileUploadTable.locator('tbody tr');

      // Check if the number of rows matches the number of selected files
      await expect(tableRows).toHaveCount(selectedFiles.length);

      // Check each file's details
      await Promise.all(selectedFiles.map(async (file, index) => {
        const row = tableRows.nth(index);

        // Check file name
        const fileName = row.getByTestId('file-name');
        await expect(fileName).toHaveText(file.name);

        // Check file size
        const fileSize = row.locator('td').nth(1);
        await expect(fileSize).toHaveText(file.size);

        // Check file status (initially empty)
        const fileStatus = row.getByTestId('file-upload-status');
        await expect(fileStatus).toBeEmpty();

        // Check file progress (initially 0%)
        const fileProgress = row.getByTestId('file-progress');
        await expect(fileProgress).toContainText('0%');
      }));
    });
  });
});
