import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

test.describe('Dataset Upload Process', () => {
  let testFilePath;

  test.beforeAll(async () => {
    // Create the attachments directory if it doesn't exist
    const attachmentsDir = path.join(__dirname, '../../../attachments');
    await fs.mkdir(attachmentsDir, { recursive: true });

    // Create a test file
    testFilePath = path.join(attachmentsDir, 'test-file.txt');
    await fs.writeFile(testFilePath, 'This is a test file for upload.');
  });

  test.afterAll(async () => {
    // Clean up: remove the test file after all tests in this describe block
    await fs.unlink(testFilePath);
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

    // Click the "Select Files" button
    await page.click('[data-testid="file-upload"]');

    // Check if there's a visible file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      // If visible, use it directly
      await fileInput.setInputFiles(testFilePath);
    } else {
      // If not visible, we need to handle it differently
      // This uses page.evaluate to interact with the page's JavaScript context
      await page.evaluate(({ testId, filePath }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (el) {
          // Create a new file input
          const input = document.createElement('input');
          input.type = 'file';
          input.style.display = 'none';
          document.body.appendChild(input);

          // Simulate a click on the original element to trigger any click
          // handlers
          el.click();

          // Use the file input to select the file
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(new File([''], filePath.split('/').pop()));
          input.files = dataTransfer.files;

          // Dispatch a change event
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { testId: 'file-upload', testFilePath });
    }

    // Wait for the file to be processed (adjust the timeout as needed)
    await page.waitForTimeout(1000);

    // Verify that the file upload table is visible after file selection
    await expect(page.locator('[data-testid="file-upload-table"]')).toBeVisible();

    // For example, check if the file name appears in the UI
    await expect(page.getByText('test-file.txt')).toBeVisible();
  });
});
