import { expect, test } from '@playwright/test';

const { AttachmentManager } = require('../../../../utils/attachment');

const testFileNames = [
  { name: 'file_1' },
];

test.describe.serial('Dataset Upload Steps', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  let testFiles; // file objects representing the files to be selected for upload

  let attachmentManager;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.beforeAll(async () => {
    // Create a unique directory for this test's attachments
    attachmentManager = new AttachmentManager(__filename);
    await attachmentManager.setup();
  });

  test.beforeAll(async () => {
    // Create test files
    testFiles = await Promise.all(testFileNames.map(async (file) => {
      const filePath = await attachmentManager.createFile(file.name, `This is the content ${file.name}`);
      return {
        ...file,
        path: filePath,
      };
    }));
  });

  test.afterAll(async () => {
    // Clean up the directory created for this test's attachments
    await attachmentManager.teardown();
  });

  test('should show all steps\' buttons with the correct labels', async () => {
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

  test.describe('File-selection step', () => {
    test.beforeAll(async () => {
      // Select files
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);

      await fileChooser.setFiles(testFiles.map((file) => file.path));
    });

    test('should show only the \'Select Files\' step\'s buttons as enabled', async () => {
      await expect(page.getByTestId('step-button-0')).not.toBeDisabled();
      await expect(page.getByTestId('step-button-1')).toBeDisabled();
      await expect(page.getByTestId('step-button-2')).toBeDisabled();
    });
  });

  test.describe('General-Info step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the General-Info step
      await page.click('[data-testid="upload-next-button"]');
    });

    test('should show the \'Select Files\' and the \'General Info\' step\'s buttons as enabled', async () => {
      const selectFilesStepButton = page.getByTestId('step-button-0');
      await expect(selectFilesStepButton).not.toBeDisabled();

      const generalInfoStepButton = page.getByTestId('step-button-1');
      await expect(generalInfoStepButton).not.toBeDisabled();

      const uploadStepButton = page.getByTestId('step-button-2');
      await expect(uploadStepButton).toBeDisabled();
    });

    test('should allow selecting values in the General-Info form\'s fields', async () => {
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();

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

  test.describe('Upload-details step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-details step
      await page.click('[data-testid="upload-next-button"]');
    });

    test('should show all steps\' buttons as enabled', async () => {
      const selectFilesStepButton = page.getByTestId('step-button-0');
      await expect(selectFilesStepButton).not.toBeDisabled();

      const generalInfoStepButton = page.getByTestId('step-button-1');
      await expect(generalInfoStepButton).not.toBeDisabled();

      const uploadStepButton = page.getByTestId('step-button-2');
      await expect(uploadStepButton).not.toBeDisabled();
    });
  });
});
