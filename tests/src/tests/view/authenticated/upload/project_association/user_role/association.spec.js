import { test as baseTest, expect } from '@playwright/test';

import { selectDropdownOption } from '../../../../../../actions';
import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { withAttachments } from '../../../../../../fixtures/withAttachments';
import { generate_unique_dataset_name } from '../../../../../../utils/dataset';

// const require = createRequire(import.meta.url);

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

// Set up attachments for this test and a temporary directory to store these
// attachments in
const test = withAttachments({ test: baseTest, filePath: __filename, attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance to be shared across all tests in this describe block

  let selectedDatasetType;
  let uploadedDatasetName;

  const NEW_PROJECT_TEXT = 'A new Project will be created';

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  // todo - before the test, verify that user has no Projects associated with
  // them
  test.describe('Upload initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files using the selectFiles method
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
      // Track selected files metadata
      const files = await trackSelectedFilesMetadata({ page });

      // Store the selected files' information in state
      selectedFiles.push(...files);

      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.trim();

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });

      // // Navigate to next step
      await navigateToNextStep({ page });

      // // Set the name of the dataset being uploaded
      const token = await page.evaluate(() => localStorage.getItem('token'));
      uploadedDatasetName = await generate_unique_dataset_name({
        requestContext: page.request,
        token,
        selectedDatasetType,
      });

      console.log('uploadedDatasetName', uploadedDatasetName);

      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      // Verify that there is no Project selected
      const projectText = page.getByTestId('new-project-alert');
      await expect(projectText).toBeVisible();
      await expect(projectText).toContainText(NEW_PROJECT_TEXT);

      // Click the "Upload" button
      await navigateToNextStep({ page });
    });

    test('should create a new Project', async () => {
      // Verify that a new Project is created
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).not.toHaveText('');
      await expect(projectLink).not.toContainText(NEW_PROJECT_TEXT);

      const projectHref = await projectLink.getAttribute('href');
      expect(projectHref).toBeTruthy();

      // Navigate to the created Project's page
      // - Create a new Page  instance for the Project view, since the Project
      // view opens in a new tab
      const [projectPage] = await Promise.all([
        page.context().waitForEvent('page'),
        projectLink.click(),
      ]);

      // Wait for the Project page to load
      await projectPage.waitForLoadState('domcontentloaded');
      await projectPage.waitForURL((url) => {
        try {
          return new URL(url).pathname === projectHref;
        } catch (error) {
          return false;
        }
      });

      // Verify that the uploaded Dataset is listed in the Project's datasets
      // table
      const projectDatasetsTable = projectPage.getByTestId('project-datasets-table');
      await expect(projectDatasetsTable).toBeVisible();
      const datasetRow = projectDatasetsTable.locator('tbody tr').filter({ hasText: uploadedDatasetName });
      await expect(datasetRow.first()).toBeVisible();

      await projectPage.close();
    });
  });
});
