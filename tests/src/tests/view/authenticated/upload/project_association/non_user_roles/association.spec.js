import { selectAutocompleteResult, selectDropdownOption } from '../../../../../../actions';
import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generate_unique_dataset_name } from '../../../../../../api/dataset';
import { expect, test } from '../../../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let selectedDatasetType;
  let uploadedDatasetName;

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasetUpload/new');
  });

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ attachmentManager }) => {
      // Select files
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

      // Select source Raw Data
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Project
      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Source Instrument
      await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });

      // Navigate to next step
      await navigateToNextStep({ page });

      // Set the name of the dataset being uploaded
      const token = await page.evaluate(() => localStorage.getItem('token'));
      uploadedDatasetName = await generate_unique_dataset_name({
        requestContext: page.request,
        token,
        type: selectedDatasetType,
      });

      // console.log('using dataset name', uploadedDatasetName);
      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      await navigateToNextStep({ page });
    });

    test('should associate the uploaded Dataset with the selected Project', async () => {
      // Verify that the uploaded Dataset is associated with the selected
      // Project
      // - Visit the Project page
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).not.toHaveText('');

      const projectHref = await projectLink.getAttribute('href');
      expect(projectHref).toBeTruthy();

      // Navigate to the selected Project's page
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
