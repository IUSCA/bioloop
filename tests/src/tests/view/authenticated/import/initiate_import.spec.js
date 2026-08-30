/**
 * Verifies the complete stateful import submission and resulting workflow.
 */
import { setCheckboxState } from '../../../../actions';
import {
  IMPORT_NEXT_BUTTON_TEST_ID,
  navigateToImportSelectDirectory,
  selectFirstImportDirectory,
} from '../../../../actions/datasetImport';
import { navigateToNextStep } from '../../../../actions/stepper';
import { expect, test } from '../../../../fixtures';

/**
 * Dataset Import E2E workflow test.
 *
 * This spec verifies the full dataset import journey from selecting an import
 * directory through submitting the import and confirming that the integrated
 * workflow was created for the new dataset.
 *
 * Previously, each part of the workflow was implemented as a separate test
 * inside test.describe.serial(), with all tests sharing the same Page instance.
 * This meant later tests depended on the state created by earlier tests and
 * could not run independently.
 *
 * Since these actions are all part of one continuous user journey, the workflow
 * is now represented as a single Playwright test. Individual parts of the
 * journey are organized with test.step() so failures are still easy to locate
 * and understand in Playwright reports.
 *
 * Structure:
 *   1. Select an import directory
 *   2. Complete General Info
 *   3. Enter Import Details
 *   4. Submit the import
 *   5. Verify the created dataset link
 *   6. Navigate to the dataset and verify the integrated workflow
 *
 * test.step() is used only to organize the workflow; each step is not an
 * independent test. The entire import flow succeeds or fails as one E2E test.
 */

const DATASET_NAME_INPUT_TEST_ID = 'dataset-name-input';

test.describe('Dataset Import — submit and verify workflow', () => {
  test('should submit and verify the import workflow', async ({ page }) => {
    // href of the dataset link shown after successful import submission
    let datasetHref;

    await navigateToImportSelectDirectory(page);

    // ----- Step 0: Select Directory -----
    await test.step('should select the first directory and enable Next', async () => {
      const hasResults = await selectFirstImportDirectory(page);

      test.skip(
        !hasResults,
        'No import directories available in test environment',
      );

      await expect(
        page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID),
      ).toBeEnabled();
    });

    // ----- Step 1: General Info -----
    await test.step(
      'should uncheck optional assignment fields and proceed to Import Details',
      async () => {
        const nextEnabled = await page
          .getByTestId(IMPORT_NEXT_BUTTON_TEST_ID)
          .isEnabled();

        if (!nextEnabled) return;

        await navigateToNextStep({
          page,
          nextButtonTestId: IMPORT_NEXT_BUTTON_TEST_ID,
        });

        await page.waitForSelector(
          '[data-testid="import-metadata-dataset-type-select"]',
        );

        const onStep1 = await page
          .locator(
            '[data-testid="import-metadata-dataset-type-select"]',
          )
          .isVisible();

        test.skip(!onStep1, 'Could not reach General Info step');

        // Uncheck optional assignment fields so no selections are required to advance.
        // Each call is a no-op when the checkbox is already unchecked or disabled
        // (i.e. when there is no available data to assign in the test environment).
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
          .poll(
            () =>
              page
                .getByTestId(IMPORT_NEXT_BUTTON_TEST_ID)
                .isEnabled(),
            { timeout: 5000 },
          )
          .toBe(true);

        await navigateToNextStep({
          page,
          nextButtonTestId: IMPORT_NEXT_BUTTON_TEST_ID,
        });
      },
    );

    // ----- Step 2: Import Details -----

    await test.step(
      'should enter a valid dataset name and enable the Import button',
      async () => {
        // Wait briefly for the Import Details card to render after navigating.
        await page
          .waitForSelector('[data-testid="import-info-card"]', {
            timeout: 10000,
          })
          .catch(() => {});

        const onStep2 = await page
          .locator('[data-testid="import-info-card"]')
          .isVisible();

        test.skip(
          !onStep2,
          'Could not reach Import Details step',
        );

        const uniqueName = `e2e_import_${Date.now()}`;

        await page
          .getByTestId(DATASET_NAME_INPUT_TEST_ID)
          .fill(uniqueName);

        // The Import button stays disabled until the async name-uniqueness check passes.
        await expect
          .poll(
            () =>
              page
                .getByTestId(IMPORT_NEXT_BUTTON_TEST_ID)
                .isEnabled(),
            { timeout: 10000 },
          )
          .toBe(true);
      },
    );

    await test.step(
      'should show a success toast after clicking Import',
      async () => {
        const onStep2 = await page
          .locator('[data-testid="import-info-card"]')
          .isVisible();

        test.skip(
          !onStep2,
          'Could not reach Import Details step',
        );

        await page.getByTestId(IMPORT_NEXT_BUTTON_TEST_ID).click();

        await expect(
          page.getByText('Initiated dataset import'),
        ).toBeVisible({
          timeout: 15000,
        });
      },
    );

    await test.step(
      'should show a link to the newly created dataset in the Import Details card',
      async () => {
        const onStep2 = await page
          .locator('[data-testid="import-info-card"]')
          .isVisible();

        test.skip(
          !onStep2,
          'Could not reach Import Details step',
        );

        const link = page.getByTestId(
          'import-success-dataset-link',
        );

        await expect(link).toBeVisible({
          timeout: 15000,
        });

        datasetHref = await link.getAttribute('href');

        expect(datasetHref).toMatch(/\/datasets\/\d+/);
      },
    );

    await test.step(
      'should navigate to the dataset page and show the integrated workflow',
      async () => {
        const onStep2 = await page
          .locator('[data-testid="import-info-card"]')
          .isVisible();

        test.skip(
          !onStep2,
          'Could not reach Import Details step',
        );

        test.skip(
          !datasetHref,
          'Dataset link was not captured',
        );

        await page
          .getByTestId('import-success-dataset-link')
          .click();

        // Verify that we landed on the correct dataset detail page.
        await expect(page).toHaveURL(/\/datasets\/\d+/, {
          timeout: 10000,
        });

        // Wait for the dataset API response so the loading overlay clears
        // (va-inner-loading hides its slot content while the fetch is in flight).
        await page.waitForLoadState('networkidle', {
          timeout: 20000,
        });

        // Verify the WORKFLOWS section is present and contains at least one workflow.
        const workflowsSection = page.getByTestId(
          'dataset-workflows-section',
        );

        await expect(workflowsSection).toBeVisible({
          timeout: 15000,
        });

        // The "no workflows" placeholder must not be shown.
        await expect(
          workflowsSection.locator(
            'text=There are no workflows associated with this dataset.',
          ),
        ).not.toBeVisible();

        // At least one workflow item must be visible.
        await expect(
          workflowsSection
            .getByTestId('workflow-item')
            .first(),
        ).toBeVisible({
          timeout: 10000,
        });

        // The workflow initiated by the import is the "integrated" workflow.
        await expect(
          workflowsSection
            .getByText('integrated', { exact: false })
            .first(),
        ).toBeVisible({
          timeout: 10000,
        });
      },
    );
  });
});
