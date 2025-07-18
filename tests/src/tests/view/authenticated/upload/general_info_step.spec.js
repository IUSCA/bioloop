import { expect, test as baseTest } from '../../../../fixtures/attachment';
import { withAttachments } from '../../../../utils/attachments/withAttachments';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

const test = withAttachments(baseTest, __filename, attachments);

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
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select'); await
      expect(datasetTypeSelect).toBeVisible();

      // Select source Raw Data
      const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
      await expect(datasetSearchInput).toBeVisible();
      // Click the input field, which will trigger the Dataset search
      await page.click('input[data-testid="upload-metadata-dataset-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-dataset-autocomplete--search-result-li-0').click();

      // Select Project
      const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
      await expect(projectSearchInput).toBeVisible();
      // Click the input field, which will trigger the Project search
      await page.click('input[data-testid="upload-metadata-project-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-project-autocomplete--search-result-li-0').click();

      // Select Source Instrument
      const sourceInstrumentSelect = page.getByTestId('upload-metadata-source-instrument-select');
      await expect(sourceInstrumentSelect).toBeVisible();
      await sourceInstrumentSelect.click();
      // Wait for the dropdown to appear
      await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });
      // Click the first option in the dropdown
      const sourceInstrumentFirstOption = page.locator('.va-select-option').first();
      // Note: We just used page.locator instead of
      // sourceInstrumentSelect.locator because the dropdown options are not
      // children of the select element in the DOM
      await sourceInstrumentFirstOption.click();
    });
  });
});
