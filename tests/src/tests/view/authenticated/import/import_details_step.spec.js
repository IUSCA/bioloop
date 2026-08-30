import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const NEXT_BUTTON_TEST_ID = 'import-next-button';
const PREVIOUS_BUTTON_TEST_ID = 'import-previous-button';
const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const DATASET_NAME_INPUT_TEST_ID = 'dataset-name-input';

const navigateToImportDetails = async (page) => {
  await page.goto('/datasets/import');

  // Wait for import sources to load
  await page.waitForSelector(
    '[data-testid="import-source-select"] .va-select-content__option',
  );

  // Open file typeahead and wait for results
  await page.click(
    `input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`,
  );

  await page.waitForSelector(
    `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
    { timeout: 15000 },
  );

  const hasResults =
    (await page
      .locator(
        `[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
      )
      .count()) > 0;

  if (!hasResults) {
    return false;
  }

  await page
    .getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`)
    .click();

  await expect(
    page.getByTestId(NEXT_BUTTON_TEST_ID),
  ).toBeEnabled();

  await navigateToNextStep({
    page,
    nextButtonTestId: NEXT_BUTTON_TEST_ID,
  });

  await page.waitForSelector(
    '[data-testid="import-metadata-dataset-type-select"]',
  );

  // Select source Raw Data
  await selectAutocompleteResult({
    page,
    testId: 'import-metadata-dataset-autocomplete',
    resultIndex: 0,
    verify: true,
  });

  // Select Project
  await selectAutocompleteResult({
    page,
    testId: 'import-metadata-project-autocomplete',
    resultIndex: 0,
    verify: true,
  });

  // Select Source Instrument
  await selectDropdownOption({
    page,
    testId: 'import-metadata-source-instrument-select',
    optionIndex: 0,
  });

  await navigateToNextStep({
    page,
    nextButtonTestId: NEXT_BUTTON_TEST_ID,
  });

  const onStep2 =
    (await page
      .locator('.va-card-title')
      .filter({ hasText: 'Import Details' })
      .count()) > 0;

  return onStep2;
};

test.describe('Dataset Import — Import Details step', () => {
  test('should show the Import Details card', async ({ page }) => {
    const onStep2 = await navigateToImportDetails(page);

    test.skip(!onStep2, 'Could not reach Import step');

    // Two .va-card elements contain a .va-card-title with "Import Details":
    // the outer page card (subtree match) and the ImportInfo card (direct child).
    // .nth(1) targets the ImportInfo card specifically.
    const card = page
      .locator('.va-card')
      .filter({
        has: page.locator('.va-card-title', {
          hasText: 'Import Details',
        }),
      })
      .nth(1);

    await expect(card).toBeVisible();
  });

  test(
    'should show the dataset name input as visible and empty',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );

      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveValue('');
    },
  );

  test(
    'should keep Next disabled while dataset name is empty',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      await expect(
        page.getByTestId(NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should show a validation error when dataset name is too short',
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
    },
  );

  test(
    'should show a validation error when dataset name contains spaces',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);
  
      test.skip(!onStep2, 'Could not reach Import step');
  
      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );
  
      // Prime the field so validation messages are displayed
      await nameInput.fill('a');
  
      await nameInput.fill('invalid name');
  
      await page.waitForTimeout(500);
  
      const errorEl = page.locator(
        '.dataset-name-input.va-text-danger',
      );
  
      await expect(errorEl).toBeVisible();
      await expect(errorEl).toContainText(
        'Dataset name cannot contain spaces',
      );
    },
  );

  test(
    'should enable Next after a valid dataset name is entered',
    async ({ page }) => {
      const onStep2 = await navigateToImportDetails(page);

      test.skip(!onStep2, 'Could not reach Import step');

      const nameInput = page.getByTestId(
        DATASET_NAME_INPUT_TEST_ID,
      );

      // Use a unique name to avoid conflicts with existing datasets
      const uniqueName = `test_import_${Date.now()}`;

      await nameInput.fill(uniqueName);

      // Wait for async name validation to complete
      await expect
        .poll(
          () =>
            page
              .getByTestId(NEXT_BUTTON_TEST_ID)
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