import {
  getAutoCompleteResults,
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../../actions';
import {
  selectFiles,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../../api/dataset';
import { expect, test } from '../../../../../../fixtures';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test('user upload creates a new project when unassigned', async ({ browser, attachmentManager }) => {
  const NEW_PROJECT_TEXT = 'A new Project will be created';
  let selectedProjectName = null;
  let shouldCreateNewProject = false;

  const page = await browser.newPage();
  await page.goto('/datasets/uploads/new');

  const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
  await selectFiles({ page, filePaths });

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

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

  const projectOptions = await getAutoCompleteResults({
    page,
    testId: 'upload-metadata-project-autocomplete',
  });
  shouldCreateNewProject = projectOptions.length === 0;
  if (!shouldCreateNewProject) {
    selectedProjectName = await selectAutocompleteResult({
      page,
      testId: 'upload-metadata-project-autocomplete',
      resultIndex: 0,
      verify: true,
    });
  }

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
  await expect(page.getByTestId('upload-details-dataset-name-input')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('token'));
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

  await page.getByTestId('upload-next-button').click();

  const projectLink = page.getByTestId('upload-details-project-link');
  await expect(projectLink).toBeVisible();
  await expect(projectLink).not.toHaveText('');
  if (!shouldCreateNewProject && selectedProjectName) {
    await expect(projectLink).toContainText(selectedProjectName);
  } else {
    await expect(projectLink).not.toContainText(NEW_PROJECT_TEXT);
  }

  const projectHref = await projectLink.getAttribute('href');
  expect(projectHref).toBeTruthy();

  const [projectPage] = await Promise.all([
    page.context().waitForEvent('page'),
    projectLink.click(),
  ]);

  await projectPage.waitForLoadState('domcontentloaded');
  await projectPage.waitForURL((url) => {
    try {
      return new URL(url).pathname === projectHref;
    } catch (error) {
      return false;
    }
  });

  const projectDatasetsTable = projectPage.getByTestId('project-datasets-table');
  await expect(projectDatasetsTable).toBeVisible();

  await projectPage.close();
  await page.close();
});
