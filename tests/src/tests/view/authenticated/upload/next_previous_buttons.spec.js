import { expect, test as baseTest } from '../../../../fixtures/attachment';
import { withAttachments } from '../../../../utils/attachments/withAttachments';

const attachments = Array.from({ length: 1 }, (_, i) => ({ name: `file_${i + 1}` }));

// Set up attachments for this test and a temporary directory to store these
// attachments in
const test = withAttachments(baseTest, __filename, attachments);

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test('should show the Previous button as disabled and Next button as enabled on page load', async () => {
    // Check the Previous button
    const previousButton = page.getByTestId('previous-button');
    await expect(previousButton).toBeDisabled();

    // Check the Next button
    const nextButton = page.getByTestId('upload-next-button');
    await expect(nextButton).toBeDisabled();
  });

  test.describe('should show the Next button as enabled after a file is selected', async () => {
    test.beforeAll(async ({ attachmentManager }) => {
      // Select a file
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
      // attach files
      await fileChooser.setFiles(attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`));
    });

    test('should show the Next button as enabled', async () => {
      // Wait for the file to be processed
      await page.waitForSelector('[data-testid="upload-selected-files-table"]');

      // Check if the Next button is now enabled
      const nextButton = page.getByTestId('upload-next-button');
      await expect(nextButton).toBeEnabled();

      // Check if the Previous button is still disabled
      const previousButton = page.getByTestId('previous-button');
      await expect(previousButton).toBeDisabled();
    });
  });

  test.describe('should show the Previous button enabled and Next button disabled on the `General Info` step', async () => {
    test.beforeAll(async () => {
      // Click the Next button to move to the General-Info step
      await page.click('[data-testid="upload-next-button"]');
    });

    test('should show the Previous button as enabled and Next button disabled', async () => {
      // Wait for the General Info step to load
      await page.waitForSelector('[data-testid="upload-metadata-dataset-type-select"]');

      // Perform all checks concurrently
      await Promise.all([
        // Check if the Previous button is now enabled
        expect(page.getByTestId('previous-button')).toBeEnabled(),

        // Check if the Next button is disabled (as no selections have been
        // made yet in the General-Info form)
        expect(page.getByTestId('upload-next-button')).toBeDisabled(),
      ]);
    });
  });

  test.describe('should show the Next button as enabled after General-Info step\'s form fields are filled', async () => {
    test.beforeAll(async () => {
      // Wait for the General Info step to load
      await page.waitForSelector('[data-testid="upload-metadata-dataset-type-select"]');

      // Select source Raw Data
      const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
      await expect(datasetSearchInput).toBeVisible();
      await datasetSearchInput.click();
      await page.getByTestId('upload-metadata-dataset-autocomplete--search-result-li-0').click();

      // Select Project
      const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
      await expect(projectSearchInput).toBeVisible();
      await projectSearchInput.click();
      await page.getByTestId('upload-metadata-project-autocomplete--search-result-li-0').click();

      // Select Source Instrument
      const sourceInstrumentSelect = page.getByTestId('upload-metadata-source-instrument-select');
      await expect(sourceInstrumentSelect).toBeVisible();
      await sourceInstrumentSelect.click();
      await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });
      await page.locator('.va-select-option').first().click();
    });

    test('should show the Next button as enabled after filling the form', async () => {
      // Check if the Next button is now enabled
      const nextButton = page.getByTestId('upload-next-button');
      await expect(nextButton).toBeEnabled();

      // check if the Previous button is still enabled
      const previousButton = page.getByTestId('previous-button');
      await expect(previousButton).toBeEnabled();
    });

    test('should show the Next button as disabled if either of the `Source Raw Data` or `Project` fields are cleared ', async () => {
      // Clear Source Raw Data and check Next/Previous buttons
      await page.locator('[data-testid="upload-metadata-dataset-autocomplete--container"] [aria-label="reset"]').click();
      // check buttons
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();
      await expect(page.getByTestId('previous-button')).toBeEnabled();

      // Refill Raw Data
      const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
      await expect(datasetSearchInput).toBeVisible();
      // Click the input field, which will trigger the Dataset search
      await page.click('input[data-testid="upload-metadata-dataset-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-dataset-autocomplete--search-result-li-0').click();
      // check buttons again
      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      await expect(page.getByTestId('previous-button')).toBeEnabled();

      // Clear Project and check Next/Previous buttons
      await page.locator('[data-testid="upload-metadata-project-autocomplete--container"] [aria-label="reset"]').click();
      // check buttons
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();
      await expect(page.getByTestId('previous-button')).toBeEnabled();

      // Refill Project
      const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
      await expect(projectSearchInput).toBeVisible();
      // Click the input field, which will trigger the Project search
      await page.click('input[data-testid="upload-metadata-project-autocomplete"]');
      // Select the first search result
      await page.getByTestId('upload-metadata-project-autocomplete--search-result-li-0').click();
      // check buttons again
      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      await expect(page.getByTestId('previous-button')).toBeEnabled();
    });
  });
});
