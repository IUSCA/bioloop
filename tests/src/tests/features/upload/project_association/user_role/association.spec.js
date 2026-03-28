import { selectDropdownOption } from '../../../../../actions';
import {
  selectFiles
} from '../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../api/dataset';
import { getProjectById } from '../../../../../api/project';
import { createTestUser } from '../../../../../api/user';
import { expect, test } from '../../../../../fixtures';
import { getTokenByRole } from '../../../../../fixtures/auth';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let testUser;
  let adminToken;

  let selectedDatasetType;
  let uploadedDatasetName;

  const NEW_PROJECT_TEXT = 'A new Project will be created';

  const selectedFiles = []; // array of selected files

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ browser, attachmentManager }) => {
      adminToken = await getTokenByRole({ role: 'admin' });
      // Create a new User to ensure that the user is not associated with any
      // Projects
      testUser = await createTestUser({ role: 'user', token: adminToken });

      // Login as the test user
      page = await browser.newPage();
      await page.goto(`/auth/iucas?ticket=${testUser.username}`);

      // Visit the dataset uploads page
      await page.goto('/datasetUpload/new');

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
      const projectIdOrSlug = projectHref.split('/').filter(Boolean).pop();
      expect(projectIdOrSlug).toBeTruthy();

      const createdProjectResponse = await getProjectById({
        requestContext: page.request,
        token: adminToken,
        id: projectIdOrSlug,
        params: { include_datasets: false },
      });
      expect(createdProjectResponse.ok()).toBeTruthy();
      const createdProject = await createdProjectResponse.json();
      expect(createdProject.owner_id).toBe(testUser.id);

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
