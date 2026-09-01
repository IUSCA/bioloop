/**
 * Verifies the Import Details initial state, dataset-name validation, and
 * forward and backward step navigation.
 */
import {
  IMPORT_NEXT_BUTTON_TEST_ID,
  navigateToImportDetails,
} from '../../../../actions/datasetImport';
import { expect, test } from '../../../../fixtures';

const PREVIOUS_BUTTON_TEST_ID = 'import-previous-button';
const DATASET_NAME_INPUT_TEST_ID = 'dataset-name-input';

test.describe('Dataset Import — Import Details step', () => {
  test(
    'should show the initial Import Details state',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      // Two cards contain this title. The second one is the ImportInfo card.
      const card = page
        .locator('.va-card')
        .filter({
          has: page.locator('.va-card-title', {
            hasText: 'Import Details',
          }),
        })
        .nth(1);
      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );

      await expect(card).toBeVisible();
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveValue('');
      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show validation errors for invalid dataset names',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );

      // The error div is gated behind `!stepIsPristine`. The pristine state
      // resets to true on the first empty → non-empty transition, so we prime
      // with a single char (keeping the value below the API-call threshold to
      // avoid a race condition), then replace it to produce a non-empty →
      // non-empty transition which sets pristine = false and shows the error.
      await nameInput.fill('a');
      await nameInput.fill('ab');

      await page.waitForTimeout(500);

      const errorEl = page.locator(
        '.dataset-name-input.va-text-danger',
      );

      await expect(errorEl).toBeVisible();
      await expect(errorEl).toContainText(
        'Dataset name must have 3 or more characters',
      );

      await nameInput.fill('invalid name');

      await page.waitForTimeout(500);

      await expect(errorEl).toContainText(
        'Dataset name cannot contain spaces',
      );
    },
  );

  test(
    'should enable Next after a valid dataset name is entered',
    { tag: '@smoke' },
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      expect(
        onStep2,
        'Expected a seeded import directory to be available',
      ).toBe(true);

      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );

      // Use a unique name to avoid conflicts with existing datasets
      const uniqueName = `test_import_${Date.now()}`;

      await nameInput.fill(uniqueName);

      // Wait for async name validation to complete
      await expect
        .poll(
          () => page
            .getByTestId(IMPORT_NEXT_BUTTON_TEST_ID)
            .isEnabled(),
          { timeout: 10000 },
        )
        .toBe(true);
    },
  );

  test(
    'should allow navigating back to General Info using Previous',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      await page
        .getByTestId(PREVIOUS_BUTTON_TEST_ID)
        .click();

      // Should be back on the General Info step
      await expect(
        page.getByTestId(
          'import-metadata-dataset-type-select',
        ),
      ).toBeVisible();
    },
  );
});
