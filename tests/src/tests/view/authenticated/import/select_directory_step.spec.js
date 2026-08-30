
import {
  assertSelectHasValue,
  selectDropdownOption,
} from '../../../../actions';
import {
  IMPORT_FILE_AUTOCOMPLETE_TEST_ID,
  IMPORT_NEXT_BUTTON_TEST_ID,
  IMPORT_SOURCE_TEST_ID,
  navigateToImportSelectDirectory,
  openImportDirectoryTypeahead,
  selectFirstImportDirectory,
} from '../../../../actions/datasetImport';

import { expect, test } from '../../../../fixtures';

/**
 * Verifies import-source selection, directory searching and selection, and
 * missing-directory validation on the Select Directory step.
 */

test.describe('Dataset Import — Select Directory step', () => {
  test(
    'should show controls and reset directory when source changes',
    async ({ page }) => {
      await navigateToImportSelectDirectory(page);

      const importSourceDropdown = page.getByTestId(IMPORT_SOURCE_TEST_ID);
      const fileTypeahead = page.getByTestId(
        IMPORT_FILE_AUTOCOMPLETE_TEST_ID,
      );
      const fileTypeaheadContainer = page.getByTestId(
        `${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--container`,
      );

      await expect(importSourceDropdown).toBeVisible();
      await expect(importSourceDropdown.locator('label')).toContainText(
        'Import Source',
      );

      await assertSelectHasValue({
        page,
        testId: IMPORT_SOURCE_TEST_ID,
        hasValue: true,
      });

      await expect(fileTypeahead).toBeVisible();
      await expect(
        fileTypeaheadContainer.locator('label'),
      ).toContainText('Dataset Path');
      await expect(
        fileTypeaheadContainer.locator('.base-path-badge'),
      ).toBeVisible();

      await importSourceDropdown.click();
      await expect(page.locator('.va-select-dropdown__content')).toBeVisible();

      const options = page.locator('.va-select-option');
      const count = await options.count();

      expect(count).toBeGreaterThanOrEqual(2);

      await page.keyboard.press('Escape');
      await selectDropdownOption({
        page,
        testId: IMPORT_SOURCE_TEST_ID,
        optionIndex: 1,
      });

      await expect(fileTypeahead).toHaveValue('');
      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeDisabled();
    },
  );

  test(
    'should filter and select an available directory',
    async ({ page }) => {
      await navigateToImportSelectDirectory(page);

      // Open the typeahead and load the initial results.
      await openImportDirectoryTypeahead(page);

      const resultsList = page.getByTestId(
        `${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul`,
      );

      await expect(resultsList).toBeVisible();

      // We derive a search term from the first available result so the test is
      // not tied to specific seeded directory names.
      const resultItems = page.locator(
        `[data-testid^="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
      );

      const initialCount = await resultItems.count();

      test.skip(
        initialCount === 0,
        'Need at least 1 result to verify filtering',
      );

      // Use part of the first directory name as the search term.
      const firstButtonText = (
        await resultItems.first().locator('button').textContent()
      ).trim();

      const dirName = firstButtonText.includes('/')
        ? firstButtonText.slice(firstButtonText.lastIndexOf('/') + 1)
        : firstButtonText;

      const searchTerm = dirName.slice(
        0,
        Math.max(5, Math.ceil(dirName.length / 2)),
      );

      // ImportStepper searches after a debounce.
      const fileInput = page.locator(
        `input[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}"]`,
      );

      await fileInput.fill(searchTerm);

      // Wait for the loading indicator, then wait for the results list.
      await page.waitForSelector(
        `[data-testid="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
        { timeout: 15000 },
      );

      // Every displayed path must contain the search term.
      const filteredItems = await page
        .locator(
          `[data-testid^="${IMPORT_FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
        )
        .all();

      expect(filteredItems.length).toBeGreaterThan(0);

      const filteredTexts = await Promise.all(
        filteredItems.map(async (item) => {
          const text = await item.locator('button').textContent();

          return text.trim();
        }),
      );

      filteredTexts.forEach((text) => {
        expect(text.toLowerCase()).toContain(
          searchTerm.toLowerCase(),
        );
      });

      await filteredItems[0].click();
      await expect(fileInput).not.toHaveValue(searchTerm);
      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeEnabled();
    },
  );

  test(
    'should show and clear the missing directory error',
    async ({ page }) => {
      await navigateToImportSelectDirectory(page);

      await openImportDirectoryTypeahead(page);
      await page.keyboard.press('Escape');

      const errorMessage = page.getByTestId('import-source-error');

      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText(
        'A file must be selected for import',
      );

      const hasResults = await selectFirstImportDirectory(page);

      test.skip(
        !hasResults,
        'No import directories available in test environment',
      );

      // Error should no longer be visible
      await expect(errorMessage).not.toBeVisible();
    },
  );
});
