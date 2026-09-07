import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
} from '../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../api/dataset';

/**
 * Completes and submits an upload for a project-association scenario.
 * @param {Object} params - Parameters object
 * @param {import('@playwright/test').Page} params.page - Playwright page
 * @param {string[]} params.filePaths - Files to upload
 * @param {boolean} params.associateProject - Whether to select a Project
 * @returns {Promise<{uploadedDatasetName: string, selectedDatasetType: string}>}
 */
export default async function submitProjectAssociationUpload({
  page,
  filePaths,
  associateProject,
}) {
  await openNewUpload({ page });
  await selectFilesAndGoToGeneralInfo({ page, filePaths });

  const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
  const selectedDatasetType = (
    await datasetTypeSelect.locator('.va-select-content__option').textContent()
  ).trim();

  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-dataset-autocomplete',
    resultIndex: 0,
    verify: true,
  });

  if (associateProject) {
    await selectAutocompleteResult({
      page,
      testId: 'upload-metadata-project-autocomplete',
      resultIndex: 0,
      verify: true,
    });
  } else {
    await page.getByTestId('upload-metadata-assign-project-checkbox').click();
  }

  await selectDropdownOption({
    page,
    testId: 'upload-metadata-source-instrument-select',
    optionIndex: 0,
    verify: true,
  });

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

  const token = await page.evaluate(
    () => globalThis.localStorage.getItem('token'),
  );
  const uploadedDatasetName = await generateUniqueDatasetName({
    requestContext: page.request,
    token,
    type: selectedDatasetType,
  });

  await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);
  await page.getByTestId('upload-next-button').click();

  return { uploadedDatasetName, selectedDatasetType };
}
