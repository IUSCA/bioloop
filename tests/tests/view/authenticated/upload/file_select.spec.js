import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const attachmentsDir = path.join(__dirname, '../../../attachments');
const testFile = 'myfile.txt';

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block
  let testFilePath;

  test.beforeAll(async ({ browser }) => {
    // Create the attachments directory where the test file to be uploaded will
    // be stored
    await fs.mkdir(attachmentsDir, { recursive: true });
    // Create a test file
    testFilePath = path.join(attachmentsDir, testFile);
    await fs.writeFile(testFilePath, 'This is a test file for upload.');

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
    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).not.toBeDisabled();

    const generalInfoStepButton = page.getByTestId('step-button-1');
    await expect(generalInfoStepButton).toBeDisabled();

    const uploadStepButton = page.getByTestId('step-button-2');
    await expect(uploadStepButton).toBeDisabled();
  });

  test('should allow selecting files that are to be uploaded"', async () => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-testid="file-upload"]'),
    ]);
    // Use the fileChooser to set files to be uploaded
    await fileChooser.setFiles(path.join(attachmentsDir, testFile));

    // Verify that the file upload table is visible after file selection
    await expect(page.locator('[data-testid="selected-files-table"]')).toBeVisible();

    // check if the file name appears in the UI
    await expect(page.getByText(testFile)).toBeVisible();
  });

  test('should move to metadata-selection step when `Next` button is clicked', async () => {
    // Click the "Next" button to proceed to the next step
    await page.click('[data-testid="next-button"]');

    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).not.toBeDisabled();

    const generalInfoStepButton = page.getByTestId('step-button-1');
    await expect(generalInfoStepButton).not.toBeDisabled();

    const uploadStepButton = page.getByTestId('step-button-2');
    await expect(uploadStepButton).toBeDisabled();
  });

  test('should display form fields in their default states, with their default values', async () => {
    // Wait for the Dataset Type row to be visible
    const datasetTypeRow = page.getByTestId('dataset-type-row');
    await expect(datasetTypeRow).toBeVisible();
    // Find the Dataset Type select widget within the row and verify it's
    // visible
    const datasetTypeSelect = page.getByTestId('dataset-type-select');
    await expect(datasetTypeSelect).toBeVisible();
    // Assert the default value
    const selectedValueElement = datasetTypeSelect.locator('.va-select-content__option');
    await expect(selectedValueElement).toBeVisible();
    const selectedValue = await selectedValueElement.textContent();
    expect(selectedValue.trim()).toBe('Data Product');

    // Verify that the "Assign source Raw Data" row is visible below the
    // "Dataset Type" row
    const assignSourceRawDataRow = page.locator('[data-testid="assign-source-row"]:below([data-testid="dataset-type-row"])');
    await expect(assignSourceRawDataRow).toBeVisible();
    // Verify that the 'Assign source Raw Data' checkbox is checked by default
    const assignSourceCheckboxWrapper = assignSourceRawDataRow.getByTestId('assign-source-checkbox');
    await expect(assignSourceCheckboxWrapper).toBeVisible();
    const checkbox = assignSourceCheckboxWrapper.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    // Verify that the 'Search Raw Data' input field is empty
    const searchRawDataInput = assignSourceRawDataRow.getByTestId('autocomplete');
    await expect(searchRawDataInput).toBeVisible();
    await expect(searchRawDataInput).toHaveValue('');

    // Verify that the "Assign Project" row is visible below the "Assign source
    // Raw Data" row
    const assignProjectRow = page.locator('[data-testid="assign-project-row"]:below([data-testid="assign-source-row"])');
    await expect(assignProjectRow).toBeVisible();
    // Verify that the 'Assign Project' checkbox is checked by default
    const assignProjectCheckboxWrapper = assignProjectRow.locator('.va-checkbox');
    await expect(assignProjectCheckboxWrapper).toBeVisible();
    // Find the actual checkbox input within the wrapper
    const projectCheckbox = assignProjectCheckboxWrapper.locator('input[type="checkbox"]');
    await expect(projectCheckbox).toBeChecked();
    // Verify that the 'Search Projects' input field is empty
    const searchProjectInput = assignProjectRow.getByTestId('autocomplete');
    await expect(searchProjectInput).toBeVisible();
    await expect(searchProjectInput).toHaveValue('');

    // Verify that the "Assign source Instrument" row is visible below the
    // "Assign Project" row
    const assignInstrumentRow = page.locator('[data-testid="assign-instrument-row"]:below([data-testid="assign-project-row"])');
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

  //   // Type 'openneuro' in the source raw data autocomplete
  //   await searchRawDataInput.fill('openne');
  //   await page.waitForTimeout(2000);
  //   // Verify that the 'openneuro' option appears and select it
  //   // const openneuroOption = page.getByRole('option', { name: 'openneuro' });
  //   // await expect(openneuroOption).toBeVisible();
  //   // await openneuroOption.click();
  //   // Verify that 'openneuro' is now selected
  //   // await expect(searchRawDataInput).toHaveValue('openneuro');
  // });
});
