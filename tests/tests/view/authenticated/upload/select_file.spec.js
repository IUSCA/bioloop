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

  test.afterAll(async () => {
    // Clean up: remove the test file after all tests in this describe block
    await fs.rm(attachmentsDir, { recursive: true, force: true });
  });

  test('should navigate to upload page and select a file', async ({ page }) => {
    // Navigate to the dataset uploads page
    await page.goto('/datasetUpload');

    // Verify that the upload button is visible
    await expect(page.locator('[data-testid="upload-dataset-button"]')).toBeVisible();
    // Click the "Upload Dataset" button
    await page.click('[data-testid="upload-dataset-button"]');

    // Verify that we're on the new upload page
    await expect(page).toHaveURL('/datasetUpload/new');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('[data-testid="file-upload"]'),
    ]);

    // Now you can use the fileChooser
    await fileChooser.setFiles(path.join(attachmentsDir, testFile));

    // Verify that the file upload table is visible after file selection
    await expect(page.locator('[data-testid="selected-files-table"]')).toBeVisible();

    // check if the file name appears in the UI
    await expect(page.getByText(testFile)).toBeVisible();
  });
});
