import {
  getAutoCompleteResults,
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../../api/dataset';
import { expect, test } from '../../../../../../fixtures';
import { submitAndWaitForUploadCompletion } from '../helpers';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

const NEW_PROJECT_TEXT = 'A new Project will be created';

async function selectExistingProjectOrUseNew(page) {
  const projectOptions = await getAutoCompleteResults({
    page,
    testId: 'upload-metadata-project-autocomplete',
  });

  if (projectOptions.length === 0) {
    return { selectedProjectName: null, shouldCreateNewProject: true };
  }

  const selectedProjectName = await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-project-autocomplete',
    resultIndex: 0,
    verify: true,
  });

  return { selectedProjectName, shouldCreateNewProject: false };
}

test('user upload is associated with an existing or new Project', async ({
  page,
  attachmentManager,
}) => {
  await openNewUpload({ page });

  const filePaths = attachments.map(
    (file) => `${attachmentManager.getPath()}/${file.name}`,
  );
  await selectFilesAndGoToGeneralInfo({ page, filePaths });

  const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
  await expect(datasetTypeSelect).toBeVisible();
  const selectedDatasetType = (await datasetTypeSelect
    .locator('.va-select-content__option')
    .textContent()).trim();

  await selectDropdownOption({
    page,
    testId: 'upload-metadata-source-instrument-select',
    optionIndex: 0,
    verify: true,
  });
  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-dataset-autocomplete',
    resultIndex: 0,
    verify: true,
  });

  const {
    selectedProjectName,
    shouldCreateNewProject,
  } = await selectExistingProjectOrUseNew(page);

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
  await expect(page.getByTestId('upload-details-dataset-name-input')).toBeVisible();

  const token = await page.evaluate(
    () => globalThis.localStorage.getItem('token'),
  );
  const uploadedDatasetName = await generateUniqueDatasetName({
    requestContext: page.request,
    token,
    type: selectedDatasetType,
  });

  await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

  if (shouldCreateNewProject) {
    const projectText = page.getByTestId('new-project-alert');
    await expect(projectText).toBeVisible();
    await expect(projectText).toContainText(NEW_PROJECT_TEXT);
  }

  await submitAndWaitForUploadCompletion(page);

  const projectLink = page.getByTestId('upload-details-project-link');
  await expect(projectLink).toBeVisible();
  await expect(projectLink).not.toHaveText('');
  if (selectedProjectName) {
    await expect(projectLink).toContainText(selectedProjectName);
  }

  const projectHref = await projectLink.getAttribute('href');
  expect(projectHref).toBeTruthy();

  const [projectPage] = await Promise.all([
    page.context().waitForEvent('page'),
    projectLink.click(),
  ]);

  try {
    await projectPage.waitForLoadState('domcontentloaded');
    await projectPage.waitForURL((url) => url.pathname === projectHref);

    const projectDatasetsTable = projectPage.getByTestId(
      'project-datasets-table',
    );
    await expect(projectDatasetsTable).toBeVisible();
    await expect(
      projectDatasetsTable.locator('tbody tr').filter({
        hasText: uploadedDatasetName,
      }).first(),
    ).toBeVisible();
  } finally {
    await projectPage.close();
  }
});
