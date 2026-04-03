import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../actions';
import {
  selectFiles
} from '../../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../../actions/stepper';
import { expect, test } from '../../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let selectedDatasetType;
  let selectedRawDataName;
  let selectedProjectName;
  let selectedInstrumentName;

  test.beforeAll(async ({ browser, attachmentManager }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasets/uploads/new');
    const filePaths = attachments.map(
      (file) => `${attachmentManager.getPath()}/${file.name}`,
    );
    await selectFiles({ page, filePaths });
    await expect(page.getByTestId('upload-selected-files-table')).toBeVisible();
  });

  test.describe('General-Info selection step', async () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
    });

    test('should allow selecting values in the General-Info form\'s fields', async () => {
      // Select (or track, if pre-populated) Dataset Type
      // Capture the pre-populated Dataset Type
      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.trim();

      // Select source Raw Data
      selectedRawDataName = await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-dataset-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Project
      selectedProjectName = await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        resultIndex: 0,
        verify: true,
      });

      // Select Source Instrument
      selectedInstrumentName = await selectDropdownOption({
        page,
        testId: 'upload-metadata-source-instrument-select',
        optionIndex: 0,
        verify: true,
      });
    });
  });

  test.describe('Upload-Details step', () => {
    test.beforeAll(async () => {
      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
    });

    test('should show all the selected General-Info form\'s fields', async () => {
    // Check Dataset Type
      const datasetTypeChip = page.getByTestId('upload-details-dataset-type-chip');
      await expect(datasetTypeChip).toBeVisible();
      await expect(datasetTypeChip).toHaveText(selectedDatasetType);

      // Check Source Raw Data
      const sourceRawDataLink = page.getByTestId('upload-details-source-raw-data-link');
      await expect(sourceRawDataLink).toBeVisible();
      await expect(sourceRawDataLink).toHaveText(selectedRawDataName);

      // Check Project
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).toHaveText(selectedProjectName);

      // Check Source Instrument
      const sourceInstrumentName = page.getByTestId('upload-details-source-instrument-name');
      await expect(sourceInstrumentName).toBeVisible();
      await expect(sourceInstrumentName).toHaveText(selectedInstrumentName);

      // Check that Dataset Name input is visible and empty
      const datasetNameInput = page.getByTestId('upload-details-dataset-name-input');
      await expect(datasetNameInput).toBeVisible();
      await expect(datasetNameInput).toHaveValue('');
    });

    test('should render upload-details controls for submission', async () => {
      await expect(page.getByTestId('upload-next-button')).toBeVisible();
      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
      await expect(page.getByTestId('upload-previous-button')).toBeEnabled();
    });
  });
});
