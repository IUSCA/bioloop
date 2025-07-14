import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const attachmentsDir = path.join(__dirname, '../../../attachments');
const testFileNames = [
  { name: 'file_1' },
  { name: 'file_2' },
  { name: 'file_3' },
];

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  let testFiles; // file objects representing the files to be selected for upload

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');

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

  test.describe('File deletion', () => {
    test.beforeAll(async () => {
      // Select files
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);

      await fileChooser.setFiles(testFiles.map((file) => file.path));
    });

    test('Should allow deleting selected files', async () => {
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      // Get initial file count
      const initialFileCount = await page.locator('[data-testid="file-table-row-name"]').count();

      expect(initialFileCount).toBeGreaterThan(0);

      // Verify each file has a delete button
      await Promise.all(
        Array.from({ length: initialFileCount }, (_, i) => expect(page.locator('[data-testid="delete-file-button"]').nth(i)).toBeVisible()),
      );

      // Delete the first file
      const deletedFileName = await page.locator('[data-testid="file-name"]').first().textContent();
      await page.locator('[data-testid="delete-file-button"]').first().click();

      // Wait for the file count to decrease
      await expect(async () => {
        const newFileCount = await page.locator('[data-testid="file-table-row-name"]').count();
        expect(newFileCount).toBe(initialFileCount - 1);
      }).toPass();

      // Verify the remaining files
      const remainingFileCount = await page.locator('[data-testid="file-table-row-name"]').count();

      const remainingFiles = await Promise.all(
        Array.from({ length: remainingFileCount }, async (_, i) => {
          const fileName = await page.locator('[data-testid="file-name"]').nth(i).textContent();
          const fileSize = await page.locator('.va-data-table__table-td').nth(i * 3 + 1).textContent();
          return { fileName, fileSize };
        }),
      );

      remainingFiles.forEach(({ fileName, fileSize }) => {
        expect(fileName).not.toBe('');
        expect(fileSize).not.toBe('');
      });

      const deletedFileStillPresent = remainingFiles.some(
        ({ fileName }) => fileName === deletedFileName,
      );

      // Assert that the deleted file is no longer present
      expect(deletedFileStillPresent, `Deleted file "${deletedFileName}" is still present in the list`).toBe(false);

      // Verify each remaining file still has a delete button
      await Promise.all(
        Array.from({ length: remainingFileCount }, (_, i) => expect(page.locator('[data-testid="delete-file-button"]').nth(i)).toBeVisible()),
      );
    });
  });
});
