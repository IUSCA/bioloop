import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const attachmentsDir = path.join(__dirname, '../../../attachments');
const testFile = 'myfile.txt';

test.describe('Dataset Upload Process', () => {
  let testFilePath;

  test.beforeAll(async () => {
    // Create the attachments directory if it doesn't exist
    await fs.mkdir(attachmentsDir, { recursive: true });

    // Create a test file
    testFilePath = path.join(attachmentsDir, testFile);
    await fs.writeFile(testFilePath, 'This is a test file for upload.');
  });

  // test.afterAll(async () => {
  //   // Clean up: remove the test file after all tests in this describe block
  //   await fs.rm(attachmentsDir, { recursive: true, force: true });
  // });

  test('should navigate to upload page and select a file', async ({ page }) => {
    // Navigate to the dataset uploads page
    await page.goto('/datasetUpload');

    // Verify that the upload button is visible
    await expect(page.locator('[data-testid="upload-dataset-button"]')).toBeVisible();
    // Click the "Upload Dataset" button
    await page.click('[data-testid="upload-dataset-button"]');

    // Verify that we're on the new upload page
    await expect(page).toHaveURL('/datasetUpload/new');

    // Verify the existence of the "Select Files" step button
    const selectFilesStepButton = page.getByTestId('step-button-0');
    await expect(selectFilesStepButton).toBeVisible();

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

    // Click the "Next" button to proceed to the next step
    await page.click('[data-testid="next-button"]');

    // Wait for the Dataset Type row to be visible
    const datasetTypeRow = page.getByTestId('dataset-type-row');
    await expect(datasetTypeRow).toBeVisible();
    // Find the Dataset Type select within the row and verify it's visible
    const datasetTypeSelect = page.getByTestId('dataset-type-select');
    await expect(datasetTypeSelect).toBeVisible();
    // Check the selected value
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
    // Find the actual checkbox input within the wrapper
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

  // test('Dataset Type select is visible with default value "Data Product"', async ({ page }) => {
  //   // Wait for the dataset type select to be visible
  //   const datasetTypeSelect = page.getByTestId('dataset-type-select');
  //   await expect(datasetTypeSelect).toBeVisible();
  //
  //   // Check if the default value is "Data Product"
  //   // const selectedValue = await datasetTypeSelect.inputValue();
  //   // expect(selectedValue);
  //   // .toBe('Data Product');
  //
  // console.log('Dataset type select is visible with default value "Not Data
  // Product"'); });
});
