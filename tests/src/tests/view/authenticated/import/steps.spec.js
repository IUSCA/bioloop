import { expect, test } from '../../../../fixtures';

test.describe('Dataset Import steps', () => {
  test('should show all step buttons with their correct labels', async ({ page }) => {
    await page.goto('/datasets/import');

    const selectDirButton = page.getByTestId('step-button-0');
    await expect(selectDirButton).toBeVisible();

    const selectDirLabel = selectDirButton.getByTestId('step-label');
    await expect(selectDirLabel).toBeVisible();
    expect((await selectDirLabel.textContent()).trim()).toBe('Select Directory');

    const generalInfoButton = page.getByTestId('step-button-1');
    await expect(generalInfoButton).toBeVisible();

    const generalInfoLabel = generalInfoButton.getByTestId('step-label');
    await expect(generalInfoLabel).toBeVisible();
    expect((await generalInfoLabel.textContent()).trim()).toBe('General Info');

    const importButton = page.getByTestId('step-button-2');
    await expect(importButton).toBeVisible();

    const importLabel = importButton.getByTestId('step-label');
    await expect(importLabel).toBeVisible();
    expect((await importLabel.textContent()).trim()).toBe('Import');
  });

  test(
    'should show only the Select Directory step button as enabled on page load',
    async ({ page }) => {
      await page.goto('/datasets/import');

      await expect(page.getByTestId('step-button-0')).not.toBeDisabled();
      await expect(page.getByTestId('step-button-1')).toBeDisabled();
      await expect(page.getByTestId('step-button-2')).toBeDisabled();
    },
  );
});