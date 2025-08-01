import { expect, test as baseTest } from '@playwright/test';

import { withAttachments } from '../../../../fixtures/withAttachments';
import {
  selectDatasetType,
  selectProject,
  selectSourceInstrument,
  selectSourceRawData,
} from '../../../../actions/datasetUpload';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

// Set up attachments for this test and a temporary directory to store these
// attachments in
const test = withAttachments({ test: baseTest, filePath: __filename, attachments });

const defaultDatasetType = 'Data Product';

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block
  let fileChooser;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe('General Info step', async () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
      [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
      // attach files
      await fileChooser.setFiles(attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`));
    });

    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the General-Info step
      await page.click('[data-testid="upload-next-button"]');
    });

    test('should display General-Info form fields in their default states, with their default values', async () => {
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
      expect(selectedValue.trim()).toBe(defaultDatasetType);

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
      // Verify that the 'Assign source Instrument' checkbox is checked by
      // default
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

    test('should allow selecting values in the General-Info step\'s fields', async () => {
      // Change selected Dataset Type to Raw Data
      await selectDatasetType({ page, datasetType: 'Raw Data' });

      // Reset selected Dataset Type to its default value
      await selectDatasetType({ page, datasetType: defaultDatasetType });

      // Select source Raw Data
      await selectSourceRawData({ page });

      // Select Project
      await selectProject({ page });

      // Select Source Instrument
      await selectSourceInstrument({ page });
    });

    test('should allow clearing values in the General-Info step\'s fields', async () => {
      // Clear Source Raw Data
      await page.locator('[data-testid="upload-metadata-dataset-autocomplete--container"] [aria-label="reset"]').click();

      // Verify Source Raw Data is cleared
      await expect(page.getByTestId('upload-metadata-dataset-autocomplete')).toHaveValue('');

      // Clear Project
      await page.locator('[data-testid="upload-metadata-project-autocomplete--container"] [aria-label="reset"]').click();

      // Verify Project is cleared
      await expect(page.getByTestId('upload-metadata-project-autocomplete')).toHaveValue('');
    });

    // test('should clear `Source Raw Data` field when `Dataset Type` is ')
  });
});
