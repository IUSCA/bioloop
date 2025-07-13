import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const attachmentsDir = path.join(__dirname, '../../../attachments');
const testFiles = [
  { name: 'file_1' },
  { name: 'file_2' },
  { name: 'file_3' },
];

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block
  let selectedDatasetType;
  let selectedRawDataName;
  let selectedProjectName;
  let selectedInstrumentName;
  const selectedFiles = [];

  test.beforeAll(async ({ browser }) => {
    // Create the attachments directory where the test file to be uploaded will
    // be stored
    await fs.mkdir(attachmentsDir, { recursive: true });
    // Create test files
    for (let i = 0; i < testFiles.length; i += 1) {
      const file = testFiles[i];
      const filePath = path.join(attachmentsDir, file.name);
      await fs.writeFile(filePath, `This is the content of ${file.name}`);
      file.path = filePath; // Add the full path to the file object
    }

    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload');
  });

  test.afterAll(async () => {
    // Clean up: remove the test file after all tests in this describe block
    await fs.rm(attachmentsDir, { recursive: true, force: true });
  });

  test('should navigate to upload page', async () => {
    // Verify that the upload button is visible
    await expect(page.locator('[data-testid="upload-dataset-button"]')).toBeVisible();
    // Click the "Upload Dataset" button
    await page.click('[data-testid="upload-dataset-button"]');

    // Verify that we're on the new upload page
    await expect(page).toHaveURL('/datasetUpload/new');
  });

  test('should show all steps\' buttons', async () => {
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

  test('should be on the \'Select Files\' step', async () => {
    await expect(page.getByTestId('step-button-0')).not.toBeDisabled();
    await expect(page.getByTestId('step-button-1')).toBeDisabled();
    await expect(page.getByTestId('step-button-2')).toBeDisabled();
  });

  test('should allow selecting files that are to be uploaded', async () => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-testid="upload-file-select"]'),
    ]);

    // Use the fileChooser to set all test files to be uploaded
    await fileChooser.setFiles(testFiles.map((file) => file.path));

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

    console.log('selectedFiles', files);

    // Verify that the correct number of files were selected
    expect(selectedFiles.length).toBe(testFiles.length);

    // Verify that the file names appear in the UI
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const file = selectedFiles[i];
      await expect(page.getByText(file.name)).toBeVisible();
    }
  });

  test('should move to metadata-selection step when `Next` button is clicked', async () => {
    // Click the "Next" button to proceed to the next step
    await page.click('[data-testid="upload-next-button"]');

    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).not.toBeDisabled();

    const generalInfoStepButton = page.getByTestId('step-button-1');
    await expect(generalInfoStepButton).not.toBeDisabled();

    const uploadStepButton = page.getByTestId('step-button-2');
    await expect(uploadStepButton).toBeDisabled();
  });

  test('should display form fields in their default states, with their default values', async () => {
    // Wait for the Dataset Type row to be visible
    const datasetTypeRow = page.getByTestId('upload-metadata-dataset-type-row');
    await expect(datasetTypeRow).toBeVisible();
    // Find the Dataset Type select widget within the row and verify it's
    // visible
    const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
    await expect(datasetTypeSelect).toBeVisible();
    // Assert the default value
    const selectedValueElement = datasetTypeSelect.locator('.va-select-content__option');
    await expect(selectedValueElement).toBeVisible();
    const selectedValue = await selectedValueElement.textContent();
    expect(selectedValue.trim()).toBe('Data Product');

    // Verify that the "Assign source Raw Data" row is visible
    const assignSourceRawDataRow = page.getByTestId('upload-metadata-assign-source-row');
    await expect(assignSourceRawDataRow).toBeVisible();
    // Verify that the 'Assign source Raw Data' checkbox is checked by default
    const assignSourceCheckboxWrapper = assignSourceRawDataRow.getByTestId('upload-metadata-assign-source-checkbox');
    await expect(assignSourceCheckboxWrapper).toBeVisible();
    const checkbox = assignSourceCheckboxWrapper.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    // Verify that the 'Search Raw Data' input field is empty
    const searchRawDataInput = assignSourceRawDataRow.getByTestId('upload-metadata-dataset-autocomplete');
    await expect(searchRawDataInput).toBeVisible();
    await expect(searchRawDataInput).toHaveValue('');

    // Verify that the "Assign Project" row is visible
    const assignProjectRow = page.getByTestId('upload-metadata-assign-project-row');
    await expect(assignProjectRow).toBeVisible();
    // Verify that the 'Assign Project' checkbox is checked by default
    const assignProjectCheckboxWrapper = assignProjectRow.locator('.va-checkbox');
    await expect(assignProjectCheckboxWrapper).toBeVisible();
    // Find the actual checkbox input within the wrapper
    const projectCheckbox = assignProjectCheckboxWrapper.locator('input[type="checkbox"]');
    await expect(projectCheckbox).toBeChecked();
    // Verify that the 'Search Projects' input field is empty
    const searchProjectInput = assignProjectRow.getByTestId('upload-metadata-project-autocomplete');
    await expect(searchProjectInput).toBeVisible();
    await expect(searchProjectInput).toHaveValue('');

    // Verify that the "Assign source Instrument" row is visible
    const assignInstrumentRow = page.getByTestId('upload-metadata-assign-instrument-row');
    await expect(assignInstrumentRow).toBeVisible();
    // Verify that the 'Assign source Instrument' checkbox is checked by default
    const assignInstrumentCheckboxWrapper = assignInstrumentRow.locator('.va-checkbox');
    await expect(assignInstrumentCheckboxWrapper).toBeVisible();
    // Find the actual checkbox input within the wrapper
    const instrumentCheckbox = assignInstrumentCheckboxWrapper.locator('input[type="checkbox"]');
    await expect(instrumentCheckbox).toBeChecked();
    // Verify that the 'Source Instrument' select field is visible and has the
    // correct placeholder
    const sourceInstrumentSelect = assignInstrumentRow.locator('.va-select__anchor');
    await expect(sourceInstrumentSelect).toBeVisible();
    // Verify that no value is selected in the Source Instrument dropdown
    const selectedOption = sourceInstrumentSelect.locator('.va-select-content__option');
    await expect(selectedOption).toHaveCount(0);
  });

  test('should allow selecting values in the metadata fields', async () => {
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
    // Note: We just used page.locator instead of sourceInstrumentSelect.locator
    // because the dropdown options are not children of the select element in
    // the DOM
    await sourceInstrumentFirstOption.click();
    // Get the selected value from the component
    selectedInstrumentName = await sourceInstrumentSelect.locator('.va-select-content__option').textContent();
    // Remove any leading/trailing whitespace
    selectedInstrumentName = selectedInstrumentName.trim();
  });

  test('should move to Upload step when `Next` button is clicked', async () => {
    // Click the "Next" button to proceed to the next step
    await page.click('[data-testid="upload-next-button"]');

    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).not.toBeDisabled();

    const generalInfoStepButton = page.getByTestId('step-button-1');
    await expect(generalInfoStepButton).not.toBeDisabled();

    const uploadStepButton = page.getByTestId('step-button-2');
    await expect(uploadStepButton).not.toBeDisabled();
  });

  test('should show all the selected metadata fields in the Upload step', async () => {
    // Check Dataset Type
    const datasetTypeChip = page.getByTestId('upload-details-dataset-type-chip');
    await expect(datasetTypeChip).toBeVisible();
    console.log('Dataset Type:', selectedDatasetType);
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
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const row = tableRows.nth(i);

      // Check file name
      const fileName = row.getByTestId('file-name');
      await expect(fileName).toHaveText(selectedFiles[i].name);

      // Check file size
      const fileSize = row.locator('td').nth(1); // Assuming size is in the second column
      await expect(fileSize).toHaveText(selectedFiles[i].size);

      // Check file status (initially empty)
      const fileStatus = row.getByTestId('file-upload-status');
      await expect(fileStatus).toBeEmpty();

      // Check file progress (initially 0%)
      const fileProgress = row.getByTestId('file-progress');
      await expect(fileProgress).toContainText('0%');
    }
  });
});
