import { expect, test } from '../../../../fixtures';

import { selectFiles, trackSelectedFilesMetadata } from '../../../../actions/datasetUpload';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe('File selection and deletion', () => {
    test('Should allow selecting files', async ({ attachmentManager }) => {
      // Select files using the selectFiles method
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });

      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();
    });

    test('Should show the correct number of files in the table', async () => {
      // Track selected files metadata
      const files = await trackSelectedFilesMetadata({ page });

      // Store the selected files' information in state
      selectedFiles.push(...files);

      // Verify that the correct number of files were selected
      expect(selectedFiles.length).toBe(attachments.length);

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
      expect(deletedFileStillPresent, `Deleted file "${deletedFileName}" is
    still present in the list`).toBe(false);

      // Verify each remaining file still has a delete button
      await Promise.all(
        Array.from({ length: remainingFileCount }, (_, i) => expect(page.locator('[data-testid="delete-file-button"]').nth(i)).toBeVisible()),
      );
    });

    test('Should hide the selected-files table when all files are deleted', async () => {
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      const initialFileCount = await page.locator('[data-testid="file-table-row-name"]').count();

      // Delete all files
      const deletePromises = Array.from({ length: initialFileCount }, async (_, i) => {
        await page.locator('[data-testid="delete-file-button"]').first().click();

        // Wait for the current file to be removed from the list
        await expect(async () => {
          const currentFileCount = await page.locator('[data-testid="file-table-row-name"]').count();
          expect(currentFileCount).toBe(initialFileCount - i - 1);
        }).toPass();
      });

      await Promise.all(deletePromises);

      // Assert that the file table is no longer visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).not.toBeVisible();

      // Assert that the file table is not present in the DOM
      const fileTableExists = await page.locator('[data-testid="upload-selected-files-table"]').count() > 0;
      expect(fileTableExists).toBe(false);
    });
  });
});
