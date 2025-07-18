import { expect, test } from '@playwright/test';

test.describe('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload');
  });

  test('should navigate to upload page', async () => {
    // Verify that the upload button is visible
    await expect(page.locator('[data-testid="upload-dataset-button"]')).toBeVisible();

    // Click the "Upload Dataset" button
    await page.click('[data-testid="upload-dataset-button"]');

    // Verify that we're on the new upload page
    await expect(page).toHaveURL('/datasetUpload/new');
  });
});
