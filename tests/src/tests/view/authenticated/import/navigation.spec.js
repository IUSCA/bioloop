import { expect, test } from '../../../../fixtures';

test.describe('Dataset Import navigation', () => {
  test('should render the import stepper at /datasets/import', async ({ page }) => {
    await page.goto('/datasets/import');

    await expect(page).toHaveURL('/datasets/import');
  });

  test('should show all three step buttons', async ({ page }) => {
    await page.goto('/datasets/import');

    // Wait for the stepper to fully render before asserting visibility
    await page.waitForSelector('[data-testid="step-button-0"]', { state: 'visible' });
    await expect(page.getByTestId('step-button-0')).toBeVisible();
    await expect(page.getByTestId('step-button-1')).toBeVisible();
    await expect(page.getByTestId('step-button-2')).toBeVisible();
  });

  test('should show the Import Source dropdown', async ({ page }) => {
    await page.goto('/datasets/import');

    await page.waitForSelector('[data-testid="import-source-select"]', { state: 'visible' });
    await expect(page.getByTestId('import-source-select')).toBeVisible();
  });

  test('should show the file path typeahead', async ({ page }) => {
    await page.goto('/datasets/import');

    await page.waitForSelector('[data-testid="import-file-autocomplete"]', { state: 'visible' });
    await expect(page.getByTestId('import-file-autocomplete')).toBeVisible();
  });
});
