import { expect, test } from '@playwright/test';

const { AttachmentManager } = require('../../../../utils/attachment');

const testFileNames = [
  { name: 'file_1' },
  { name: 'file_2' },
  { name: 'file_3' },
];

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block
  let fileChooser;

  let testFiles; // file objects representing the files to be selected for upload
  const selectedFiles = []; // array of selected files

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

  test.describe('File selection and deletion', () => {
    test.beforeAll(async () => {
      // Select files
      [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
    });

    test('Should allow selecting files', async () => {
      await fileChooser.setFiles(testFiles.map((file) => file.path));
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();
    });

    test('Should show the correct number of files in the table', async () => {
      // Get all rows in the table
      const tableRows = page.locator('[data-testid="upload-selected-files-table"] tbody tr');

      // For each row, extract the file name and size
      const files = await tableRows.evaluateAll((rows) => rows.map((row) => {
        const nameElement = row.querySelector('[data-testid="file-name"]');
        const sizeElement = row.querySelector('td:nth-child(2)');
        return {
          name: nameElement ? nameElement.textContent.trim() : '',
          size: sizeElement ? sizeElement.textContent.trim() : '',
        };
      }));

      // Store the selected files' information in state
      selectedFiles.push(...files);

      // Verify that the correct number of files were selected
      expect(selectedFiles.length).toBe(testFileNames.length);

      // Verify that the file names appear in the UI
      await Promise.all(selectedFiles.map(async (file) => {
        await expect(page.getByText(file.name)).toBeVisible();
      }));
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

      // await new Promise(() => {});
    });

    test('Should hide the file table when all files are deleted', async () => {
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      const initialFileCount = await page.locator('[data-testid="file-table-row-name"]').count();

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < initialFileCount; i += 1) {
        await page.locator('[data-testid="delete-file-button"]').first().click();

        // Wait for the file to be removed from the list
        // eslint-disable-next-line no-loop-func
        await expect(async () => {
          const currentFileCount = await page.locator('[data-testid="file-table-row-name"]').count();
          expect(currentFileCount).toBe(initialFileCount - i - 1);
        }).toPass();
      }
      /* eslint-disable no-await-in-loop */

      // Assert that the file table is no longer visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).not.toBeVisible();

      // Assert that the file table is not present in the DOM
      const fileTableExists = await page.locator('[data-testid="upload-selected-files-table"]').count() > 0;
      expect(fileTableExists).toBe(false);
    });
  });
});
