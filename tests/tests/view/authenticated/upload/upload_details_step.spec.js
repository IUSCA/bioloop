import { expect, test as baseTest } from '../../../../fixtures/attachment';
import { withAttachments } from '../../../../utils/attachments/withAttachments';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

const test = withAttachments(baseTest, __filename, attachments);

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
      // Select a file
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
      // attach files
      await fileChooser.setFiles(attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`));
    });

    test('Wait for the file upload table to be visible', async () => {
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      // Get all rows in the table
      const tableRows = page.locator('[data-testid="upload-selected-files-table"] tbody tr');

      // For each row, extract the file name and size
      const files = await tableRows.evaluateAll((rows) => rows.map((row) => {
        const nameElement = row.querySelector('[data-testid="file-name"]');
        const sizeElement = row.querySelector('td:nth-child(2)');
        return {
          name: nameElement ? nameElement.textContent.trim() : '',
          size: sizeElement ? sizeElement.textContent.trim() : '',
        };
      }));

      // Store the selected files' information in state
      selectedFiles.push(...files);
    });
  });

  test.describe('General-Info selection step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-Details step
      await page.click('[data-testid="upload-next-button"]');
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
      const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
      await expect(datasetSearchInput).toBeVisible();
      // Click the input field, which will trigger the Dataset search
      await page.click('input[data-testid="upload-metadata-dataset-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-dataset-autocomplete--search-result-li-0').click();
      selectedRawDataName = await datasetSearchInput.inputValue();

      // Select Project
      const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
      await expect(projectSearchInput).toBeVisible();
      // Click the input field, which will trigger the Project search
      await page.click('input[data-testid="upload-metadata-project-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-project-autocomplete--search-result-li-0').click();
      selectedProjectName = await projectSearchInput.inputValue();

      // Select Source Instrument
      const sourceInstrumentSelect = page.getByTestId('upload-metadata-source-instrument-select');
      await expect(sourceInstrumentSelect).toBeVisible();
      await sourceInstrumentSelect.click();
      // Wait for the dropdown to appear
      await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });
      // Click the first option in the dropdown
      const sourceInstrumentFirstOption = page.locator('.va-select-option').first();
      // Note: Above, we used page.locator instead of
      // sourceInstrumentSelect.locator because the dropdown options are not
      // children of the dropdown-select element in the DOM
      await sourceInstrumentFirstOption.click();
      // Get the selected value from the component
      selectedInstrumentName = await sourceInstrumentSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedInstrumentName = selectedInstrumentName.trim();
    });
  });

  test.describe('Upload details step', () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the -Info step
      await page.click('[data-testid="upload-next-button"]');
    });

    test('should show all the selected General-Info form\'s fields in the Upload step', async () => {
    // Check Dataset Type
      const datasetTypeChip = page.getByTestId('upload-details-dataset-type-chip');
      await expect(datasetTypeChip).toBeVisible();
      // console.log('Dataset Type:', selectedDatasetType);
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
      const datasetNameRow = page.getByTestId('upload-details-dataset-name-row');
      const datasetNameError = datasetNameRow.locator('.va-text-danger.text-xs.dataset-name-input');
      await expect(datasetNameError).toBeVisible();
      await expect(datasetNameError).toHaveText('Dataset name cannot be empty');
    });

    test('should show all the selected files and their details in the Upload step', async () => {
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
