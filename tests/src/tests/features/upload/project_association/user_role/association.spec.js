import { selectDropdownOption } from '../../../../../actions';
import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../actions/stepper';
import { getProjectById } from '../../../../../api/project';
import { generateUniqueDatasetName } from '../../../../../api/dataset';
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
      selectedDatasetType = selectedDatasetType.trim();

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

      await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);

      // Verify that there is no Project selected
      const projectText = page.getByTestId('new-project-alert');
      await expect(projectText).toBeVisible();
      await expect(projectText).toContainText(NEW_PROJECT_TEXT);

      // Click the "Upload" button
      await page.getByTestId('upload-next-button').click();
    });

    test('should create a new Project', async () => {
      // Verify that a new Project is created
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
