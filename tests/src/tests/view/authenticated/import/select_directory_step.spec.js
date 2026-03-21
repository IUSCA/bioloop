import {
  assertSelectHasValue,
  selectDropdownOption,
} from '../../../../actions';
import { expect, test } from '../../../../fixtures';

const IMPORT_SOURCE_TEST_ID = 'import-source-select';
const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const NEXT_BUTTON_TEST_ID = 'import-next-button';

test.describe.serial('Dataset Import — Select Directory step', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasets/import');
  });

  test('should render the Import Source dropdown with the label "Import Source"', async () => {
    const importSourceDropdown = page.getByTestId(IMPORT_SOURCE_TEST_ID);
    await expect(importSourceDropdown).toBeVisible();

    const label = importSourceDropdown.locator('label');
    await expect(label).toContainText('Import Source');
  });

  test('should auto-select the first import source on mount', async () => {
    // The component selects the first configured import source by default
    await assertSelectHasValue({ page, testId: IMPORT_SOURCE_TEST_ID, hasValue: true });
  });

  test('should render the file typeahead with the label "Dataset Path"', async () => {
    const fileTypeahead = page.getByTestId(FILE_AUTOCOMPLETE_TEST_ID);
    await expect(fileTypeahead).toBeVisible();

    const label = page.locator(`[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--container"] label`);
    await expect(label).toContainText('Dataset Path');
  });

  test('should show the import source path as a badge in the file typeahead', async () => {
    // After import source auto-selection, the base path badge is visible
    const badge = page.locator(`[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--container"] .base-path-badge`);
    await expect(badge).toBeVisible();
  });

  test('should have Next disabled before any directory is selected', async () => {
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();
  });

  test('should open the import source dropdown and show seeded options', async () => {
    const importSourceDropdown = page.getByTestId(IMPORT_SOURCE_TEST_ID);
    await importSourceDropdown.click();

    await page.waitForSelector('.va-select-dropdown__content', { state: 'visible' });

    const options = page.locator('.va-select-option');
    const count = await options.count();

    // At least the two seeded sources should be present
    expect(count).toBeGreaterThanOrEqual(2);

    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape');
  });

  test('should switch the import source and reset the file search', async () => {
    // Select the second import source (index 1)
    await selectDropdownOption({
      page,
      testId: IMPORT_SOURCE_TEST_ID,
      optionIndex: 1,
    });

    // After switching the source, the file typeahead should be cleared
    const fileInput = page.locator(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);
    await expect(fileInput).toHaveValue('');

    // Next should still be disabled
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();
  });

  test('should open the file typeahead and show available directories', async () => {
    // Switch back to the first import source
    await selectDropdownOption({
      page,
      testId: IMPORT_SOURCE_TEST_ID,
      optionIndex: 0,
    });

    // Click the file typeahead input to trigger the search
    await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);

    // Wait for loading or results
    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"], [data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul__loading"]`,
    );

    // Wait for the loading state to resolve
    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
      { timeout: 15000 },
    );

    // The results list is now visible (with results or "None matched")
    const resultsList = page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul`);
    await expect(resultsList).toBeVisible();
  });

  test('should filter results so that all visible entries contain the search term', async () => {
    // The typeahead is open (results list visible) from the previous test.
    // We derive a search term from the first available result so the test is
    // not tied to specific seeded directory names.
    const resultItems = page.locator(
      `[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`,
    );
    const initialCount = await resultItems.count();
    test.skip(initialCount < 2, 'Need at least 2 results to verify filtering');

    // Extract the directory name from the first result's full path and use the
    // first half as a search term that should narrow the results.
    const firstButtonText = (
      await resultItems.first().locator('button').textContent()
    ).trim();
    const dirName = firstButtonText.includes('/')
      ? firstButtonText.slice(firstButtonText.lastIndexOf('/') + 1)
      : firstButtonText;
    const searchTerm = dirName.slice(0, Math.max(5, Math.ceil(dirName.length / 2)));

    // Type the search term into the file input.  The watch in ImportStepper
    // sets searchingFiles = true immediately, then fires the API call after a 1
    // s debounce.  We wait for the results list to reappear after loading.
    const fileInput = page.locator(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);
    await fileInput.fill(searchTerm);

    // Wait for the loading indicator, then wait for the results list.
    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
      { timeout: 15000 },
    );

    // Every visible result must contain the search term (the full path
    // displayed by the autocomplete always includes the relative portion that
    // was typed).
    const filteredItems = await page
      .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
      .all();

    expect(filteredItems.length).toBeGreaterThan(0);

    for (const item of filteredItems) {
      const text = (await item.locator('button').textContent()).trim();
      expect(text.toLowerCase()).toContain(searchTerm.toLowerCase());
    }

    // Clear the search term so the following test starts with a clean state.
    await fileInput.fill('');
    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
      { timeout: 15000 },
    );
  });

  test('should enable Next after selecting a directory', async () => {
    const hasResults = await page
      .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
      .count() > 0;

    test.skip(!hasResults, 'No import directories available in test environment');

    // Select the first result
    await page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`).click();

    // Input should now contain the selected directory name
    const fileInput = page.locator(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);
    const selectedValue = await fileInput.inputValue();
    expect(selectedValue.length).toBeGreaterThan(0);

    // Next should now be enabled
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
  });

  test('should show an error message when Next is clicked without a directory selected', async () => {
    // Navigate to a fresh page to reset state
    await page.goto('/datasets/import');

    // Wait for import sources to load
    await page.waitForSelector('[data-testid="import-source-select"] .va-select-content__option');

    // Try to proceed to the next step without selecting a directory.
    // Clicking Next when disabled does nothing, so we need to trick the stepper
    // into showing the error. The error appears when step is no longer pristine
    // (i.e., user has interacted with the form). Clicking the file typeahead
    // and then closing it marks the step as non-pristine.
    await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);

    // Wait for the dropdown to open
    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"], [data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul__loading"]`,
    );

    // Close by clicking outside
    await page.keyboard.press('Escape');

    // Wait a moment for reactive updates
    await page.waitForTimeout(500);

    // The error message should now appear since the step is no longer pristine
    // and no file is selected
    const errorMessage = page.getByTestId('import-source-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('A file must be selected for import');
  });

  test('should clear the error when a directory is selected', async () => {
    // The error is showing from the previous test; select a directory to clear
    // it
    await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);

    await page.waitForSelector(
      `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
      { timeout: 15000 },
    );

    const hasResults = await page
      .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
      .count() > 0;

    test.skip(!hasResults, 'No import directories available in test environment');

    await page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`).click();

    // Error should no longer be visible
    const errorMessage = page.getByTestId('import-source-error');
    await expect(errorMessage).not.toBeVisible();
  });
});
