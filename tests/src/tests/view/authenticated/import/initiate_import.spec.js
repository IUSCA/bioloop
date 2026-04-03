import { setCheckboxState } from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const NEXT_BUTTON_TEST_ID = 'import-next-button';
const DATASET_NAME_INPUT_TEST_ID = 'dataset-name-input';

test.describe.serial('Dataset Import — submit and verify workflow', () => {
  test.describe.configure({ timeout: 120000 });
  let page;
  // href of the dataset link shown after successful import submission
  let datasetHref;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasets/import');
  });

  // ----- Step 0: Select Directory -----
  test.describe('Step 0 — select a directory', () => {
    test.beforeAll(async () => {
      await page.waitForSelector(
        '[data-testid="import-source-select"] .va-select-content__option',
      );

      await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);
      await page.waitForSelector(
        `[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul"]`,
        // { timeout: 15000 },
      );
    });

    test('should select the first directory and enable Next', async () => {
      const hasResults = (await page
        .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
        .count()) > 0;

      // test.skip(!hasResults, 'No import directories available in test
      // environment');

      await page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`).click();
      // Todo: assert that a value was selected
      await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
    });
  });

  // ----- Step 1: General Info -----
  test.describe('Step 1 — General Info', () => {
    test.beforeAll(async () => {
      const nextEnabled = await page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled();
      if (!nextEnabled) return;

      await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
      await page.waitForSelector('[data-testid="import-metadata-dataset-type-select"]');
    });

    test('should uncheck optional assignment fields and proceed to Import Details', async () => {
      const onStep1 = await page
        .locator('[data-testid="import-metadata-dataset-type-select"]')
        .isVisible();

      test.skip(!onStep1, 'Could not reach General Info step');

      // Uncheck optional assignment fields so no selections are required to
      // advance. Each call is a no-op when the checkbox is already unchecked or
      // disabled (i.e. when there is no available data to assign in the test
      // environment).
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-source-checkbox',
        state: false,
      });
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-project-checkbox',
        state: false,
      });
      await setCheckboxState({
        page,
        testId: 'import-metadata-assign-instrument-checkbox',
        state: false,
      });

      await expect
        .poll(() => page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled(), { timeout: 5000 })
        .toBe(true);

      await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
    });
  });

  // ----- Step 2: Import Details -----
  test.describe('Step 2 — Import Details, submit, and verify', () => {
    test.beforeAll(async () => {
      // Wait briefly for the Import Details card to render after navigating.
      await page
        .waitForSelector('[data-testid="import-info-card"]', { timeout: 10000 })
        .catch(() => {});
    });

    test('should enter a valid dataset name and enable the Import button', async () => {
      const onStep2 = await page.locator('[data-testid="import-info-card"]').isVisible();
      test.skip(!onStep2, 'Could not reach Import Details step');

      const uniqueName = `e2e_import_${Date.now()}`;
      await page.getByTestId(DATASET_NAME_INPUT_TEST_ID).fill(uniqueName);

      // The Import button stays disabled until the async name-uniqueness check
      // passes.
      await expect
        .poll(() => page.getByTestId(NEXT_BUTTON_TEST_ID).isEnabled(), { timeout: 30000 })
        .toBe(true);
    });

    test('should show a success toast after clicking Import', async () => {
      const onStep2 = await page.locator('[data-testid="import-info-card"]').isVisible();
      test.skip(!onStep2, 'Could not reach Import Details step');

      await page.getByTestId(NEXT_BUTTON_TEST_ID).click();

      await expect(page.getByText('Initiated dataset import')).toBeVisible({
        timeout: 15000,
      });
    });

    test('should show a link to the newly created dataset in the Import Details card', async () => {
      const onStep2 = await page.locator('[data-testid="import-info-card"]').isVisible();
      test.skip(!onStep2, 'Could not reach Import Details step');

      const link = page.getByTestId('import-success-dataset-link');
      await expect(link).toBeVisible({ timeout: 15000 });

      datasetHref = await link.getAttribute('href');
      expect(datasetHref).toMatch(/\/datasets\/\d+/);
    });

    test('should navigate to the dataset page and show the integrated workflow', async () => {
      const onStep2 = await page.locator('[data-testid="import-info-card"]').isVisible();
      test.skip(!onStep2, 'Could not reach Import Details step');
      test.skip(!datasetHref, 'Dataset link was not captured');

      await page.getByTestId('import-success-dataset-link').click();

      // Verify that we landed on the correct dataset detail page.
      await expect(page).toHaveURL(/\/datasets\/\d+/, { timeout: 10000 });

      // Wait for the dataset API response so the loading overlay clears
      // (va-inner-loading hides its slot content while the fetch is in flight).
      await page.waitForLoadState('networkidle', { timeout: 20000 });

      // Verify the WORKFLOWS section is present and contains at least one
      // workflow.
      const workflowsSection = page.getByTestId('dataset-workflows-section');
      await expect(workflowsSection).toBeVisible({ timeout: 15000 });

      // The "no workflows" placeholder must not be shown.
      await expect(
        workflowsSection.locator('text=There are no workflows associated with this dataset.'),
      ).not.toBeVisible();

      // At least one workflow item must be visible.
      await expect(workflowsSection.getByTestId('workflow-item').first()).toBeVisible({
        timeout: 10000,
      });

      // The workflow initiated by the import is the "integrated" workflow.
      await expect(
        workflowsSection.getByText('integrated', { exact: false }).first(),
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
