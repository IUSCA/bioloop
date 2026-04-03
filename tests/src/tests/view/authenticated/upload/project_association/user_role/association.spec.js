import { selectAutocompleteResult, selectDropdownOption } from '../../../../../../actions';
import { selectFiles } from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../../api/dataset';
import { getProjectById } from '../../../../../../api/project';
import { createTestUser } from '../../../../../../api/user';
import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page;
  let testUser;
  let adminToken;
  let selectedDatasetType;
  let uploadedDatasetName;

  const NEW_PROJECT_TEXT = 'A new Project will be created';

  test.describe('Upload-initiation step', () => {
    test.beforeAll(async ({ browser, attachmentManager }) => {
      adminToken = await getTokenByRole({ role: 'admin' });
      expect(adminToken).toBeTruthy();
      testUser = await createTestUser({ role: 'user', token: adminToken });

      page = await browser.newPage();
      await page.goto(`/auth/iucas?ticket=${testUser.username}`);
      await page.goto('/datasets/uploads/new');

      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths, fileSelectTestId: 'upload-file-select' });
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      selectedDatasetType = (await datasetTypeSelect
        .locator('.va-select-content__option')
        .textContent()).replace(/\s+check$/, '').trim();

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

      const projectAlert = page.getByTestId('new-project-alert');
      await expect(projectAlert).toBeVisible();
      await expect(projectAlert).toContainText(NEW_PROJECT_TEXT);

      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
      await expect(page.getByTestId('upload-details-dataset-name-input')).toBeVisible();

      const token = await page.evaluate(() => globalThis.localStorage.getItem('token'));
      uploadedDatasetName = await generateUniqueDatasetName({
        requestContext: page.request,
        token,
        type: selectedDatasetType,
      });

      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);
      await page.getByTestId('upload-next-button').click();
    });

    test('should create a new project owned by the uploading user', async () => {
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).not.toHaveText('');
      await expect(projectLink).not.toContainText(NEW_PROJECT_TEXT);

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

      await page.goto(projectHref, { waitUntil: 'domcontentloaded' });
      const projectDatasetsTable = page.getByTestId('project-datasets-table');
      await expect(projectDatasetsTable).toBeVisible();
      await expect(projectDatasetsTable.getByText(uploadedDatasetName)).toBeVisible();
    });
  });
});
