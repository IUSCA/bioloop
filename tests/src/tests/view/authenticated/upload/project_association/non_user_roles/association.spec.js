import { selectAutocompleteResult, selectDropdownOption } from '../../../../../../actions';
import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../../api/dataset';
import { get } from '../../../../../../api';
import { expect, test } from '../../../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance
  let createdDatasetId;

  let selectedDatasetType;
  let uploadedDatasetName;

  const selectedFiles = []; // array of selected files

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Visit the dataset uploads page
    await page.goto('/datasets/uploads/new');
  });

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ attachmentManager }, testInfo) => {
      testInfo.setTimeout(120000);
      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths, fileSelectTestId: 'upload-file-select' });
      // Track selected files metadata
      const files = await trackSelectedFilesMetadata({ page, tableTestId: 'upload-selected-files-table' });

      // Store the selected files' information in state
      selectedFiles.push(...files);

      // Click the "Next" button to proceed to the Upload-Details step
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.replace(/\s+check$/, '').trim();

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
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

      // Set the name of the dataset being uploaded
      const token = await page.evaluate(() => localStorage.getItem('token'));
      uploadedDatasetName = await generateUniqueDatasetName({
        requestContext: page.request,
        token,
        type: selectedDatasetType,
      });

      // console.log('using dataset name', uploadedDatasetName);
      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      const uploadRegistrationPromise = page.waitForResponse(
        (response) => /\/api\/datasets\/uploads$/.test(response.url())
          && response.request().method() === 'POST'
          && response.ok(),
      );
      // Click the "Upload" button
      await page.getByTestId('upload-next-button').click();
      const uploadRegistrationResponse = await uploadRegistrationPromise;
      const uploadRegistrationPayload = await uploadRegistrationResponse.json();
      createdDatasetId = uploadRegistrationPayload?.dataset?.id;
      expect(createdDatasetId).toBeTruthy();

      const uploadedChip = page.getByTestId('chip-uploaded');
      const failedChip = page.getByTestId('chip-upload-failed');
      await expect(uploadedChip.or(failedChip)).toBeVisible({ timeout: 120000 });
      if (await failedChip.isVisible()) {
        const failureMessage = await page.getByTestId('submission-alert').innerText();
        throw new Error(`Upload failed before project-association assertion: ${failureMessage}`);
      }
    });

    test('should associate the uploaded Dataset with the selected Project', async () => {
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).not.toHaveText('');

      const projectHref = await projectLink.getAttribute('href');
      expect(projectHref).toBeTruthy();

      const currentToken = await page.evaluate(
        () => globalThis.localStorage.getItem('token'),
      );
      expect(currentToken).toBeTruthy();

      const response = await get({
        requestContext: page.request,
        token: currentToken,
        url: `/datasets/${createdDatasetId}`,
        params: { include_projects: true },
      });
      const body = await response.json();
      const projects = body.projects || [];
      expect(projects.length).toBeGreaterThan(0);
    });
  });
});
