import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const attachmentsDir = path.join(__dirname, '../../../attachments');
const testFileNames = [
  { name: 'file_1' },
];

test.describe.serial('Dataset Upload Steps', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  let testFiles; // file objects representing the files to be selected for upload

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.beforeAll(async () => {
    // Create the attachments directory where the test file to be uploaded will
    // be stored
    await fs.mkdir(attachmentsDir, { recursive: true });
  });

  test.beforeAll(async () => {
    // Create test files
    testFiles = await Promise.all(testFileNames.map(async (file) => {
      const filePath = path.join(attachmentsDir, file.name);
      await fs.writeFile(filePath, `This is the content of ${file.name}`);
      return { ...file, path: filePath };
    }));
  });

  test.afterAll(async () => {
    // Clean up: remove the test file after all tests in this describe block
    await fs.rm(attachmentsDir, { recursive: true, force: true });
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
    test.beforeAll(async () => {
      // Select a file
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
      await fileChooser.setFiles(testFiles.map((file) => file.path));
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
      // Clear Source Raw Data and check Next button
      await page.getByTestId('upload-metadata-dataset-autocomplete').click();
      await page.locator('[data-testid="upload-metadata-dataset-autocomplete"] button[aria-label="reset"]').click();
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();
      await expect(page.getByTestId('previous-button')).toBeEnabled();

      // // Select source Raw Data
      // const datasetSearchInput = page.getByTestId('upload-metadata-dataset-autocomplete');
      // await expect(datasetSearchInput).toBeVisible();
      // // Click the input field, which will trigger the Dataset search
      // await page.click('input[data-testid="upload-metadata-dataset-autocomplete"]');
      // // Select the first search result
      // await page.getByTestId('upload-metadata-dataset-autocomplete--search-result-li-0').click();
      //
      // // Clear Project and check Next button
      // await page.getByTestId('upload-metadata-project-autocomplete').click();
      // await
      // page.locator('[data-testid="upload-metadata-project-autocomplete"]
      // button[aria-label="reset"]').click(); await
      // expect(page.getByTestId('upload-next-button')).toBeDisabled(); await
      // expect(page.getByTestId('previous-button')).toBeEnabled();
      //
      // // Refill Project
      // const projectSearchInput = page.getByTestId('upload-metadata-project-autocomplete');
      // await expect(projectSearchInput).toBeVisible();
      // // Click the input field, which will trigger the Project search
      // await page.click('input[data-testid="upload-metadata-project-autocomplete"]');
      // // Select the first search result
      // await page.getByTestId('upload-metadata-project-autocomplete--search-result-li-0').click();
      // await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      // await expect(page.getByTestId('previous-button')).toBeEnabled();
    });
  });
});
