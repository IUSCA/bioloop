import path from 'path';

import { expect, test } from '../../../../fixtures/attachment';

const attachments = [
  { name: 'file_1' },
  { name: 'file_2' },
  { name: 'file_3' },
];

test.use({
  directory: __dirname,
  testFile: path.basename(__filename),
  attachments,
});

test.describe('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block
  let fileChooser;

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe.serial('File selection and deletion', () => {
    test.beforeAll(async () => {
      // Select files
      [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('[data-testid="upload-file-select"]'),
      ]);
    });

    // todo - document fixture usage
    test('Should allow selecting files', async ({ attachmentManager }) => {
      // Select test files
      await fileChooser.setFiles(attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`));
      // Wait for the file upload table to be visible
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      // await new Promise(() => {});
    });

    test('Should show the correct number of files in the table', async () => {
      await expect(page.locator('[data-testid="upload-selected-files-table"]')).toBeVisible();

      // // Get all rows in the table
      const tableRows = page.locator('[data-testid="upload-selected-files-table"] tbody tr');

      // await new Promise(() => {});

      // For each row, extract the file name and size
      const files = await tableRows.evaluateAll((rows) => rows.map((row) => {
        const nameElement = row.querySelector('[data-testid="file-name"]');
        const sizeElement = row.querySelector('td:nth-child(2)');

        console.log(`file: ${nameElement.textContent.trim()}, size: ${sizeElement.textContent.trim()}`);

        const ret = {
          name: nameElement ? nameElement.textContent.trim() : '',
          size: sizeElement ? sizeElement.textContent.trim() : '',
        };
        // console.log(`file: ${ret.name}, size: ${ret.size}`);
        return ret;
      }));

      // Store the selected files' information in state
      selectedFiles.push(...files);
      console.log('selected files: ', selectedFiles);

      // Verify that the correct number of files were selected
      expect(selectedFiles.length).toBe(attachments.length);

      // Verify that the file names appear in the UI
      await Promise.all(selectedFiles.map(async (file) => {
        await expect(page.getByText(file.name)).toBeVisible();
      }));

      // await new Promise(() => {});
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
