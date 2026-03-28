import { expect, test } from '../../../fixtures';

test.describe('Dataset Upload Process', () => {
  let page; // Playwright page instance

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasets/uploads');
  });

  test('should navigate from uploads list to new upload page', async () => {
    await Promise.all([
      page.waitForURL('**/datasets/uploads/new'),
      page.getByRole('button', { name: 'Upload Dataset' }).click(),
    ]);
    await expect(page).toHaveURL('/datasets/uploads/new');
    await expect(page.getByTestId('upload-dataset-stepper')).toBeVisible();
  });
});
