import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';

import { selectAutocompleteResult, selectDropdownOption } from '../../../../../../actions';
import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';

import { generate_unique_dataset_name } from '../../../../../../utils/dataset';

import { getDatasets } from '../../../../../../api/dataset';

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

  test.describe('Upload initiation step', () => {
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

      // Uncheck "Assign Project" to skip Project association
      await page.getByTestId('upload-metadata-assign-project-checkbox').click();

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
        selectedDatasetType,
      });

      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      await navigateToNextStep({ page });
    });

    test('should not associate the uploaded Dataset with any Project', async () => {
      // Verify that the uploaded Dataset is associated with the selected
      // any Project
      const adminToken = await getTokenByRole({ role: 'admin' });
      const response = await getDatasets({
        token: adminToken,
        params: {
          name: uploadedDatasetName,
          type: selectedDatasetType.split(' ').join('_').toUpperCase(),
          include_projects: true,
        },
      });
      const body = await response.json();
      if (!body || !body.datasets || body.datasets.length === 0) {
        throw new Error(`No datasets found matching name: ${uploadedDatasetName}, type: ${selectedDatasetType.split(' ').join('_').toUpperCase()} `);
      }
      if (body.datasets.length > 1) {
        throw new Error(`Multiple datasets found matching name: ${uploadedDatasetName}, type: ${selectedDatasetType.split(' ').join('_').toUpperCase()}`);
      }
      const matching_dataset = body.datasets[0];
      expect(matching_dataset.projects).toHaveLength(0);
    });
  });
});
