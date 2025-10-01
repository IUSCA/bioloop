import {
  selectFiles, trackSelectedFilesMetadata,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { createDataset, generate_unique_dataset_name } from '../../../../../../api/dataset';
import { createProject, editProjectDatasets, editProjectUsers } from '../../../../../../api/project';
import { createTestUser } from '../../../../../../api/user';
import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';

const config = require('config');

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let testUser;

  let selectedDatasetType;
  let uploadedDatasetName;

  const NEW_PROJECT_TEXT = 'A new Project will be created';

  const selectedFiles = []; // array of selected files

  test.describe('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ browser, attachmentManager }) => {
      page = await browser.newPage();

      const adminToken = await getTokenByRole({ role: 'admin' });

      console.log('adminToken', adminToken);

      // Create a new User. Test will be run as this user.
      testUser = await createTestUser({ role: 'user', token: adminToken });

      // Create a new Project. Test will use this Project.
      const testProject = await createProject({
        token: adminToken,
        data: { name: 'TestProject' },
      });
      // Create a few Datasets to associate with the Project. Test will use
      // these Datasets as options of field "Source Raw Data".
      const datasetsToAssociateWithTestProject = [];
      const numDatasetsToAssociate = 3;
      for (let i = 0; i < numDatasetsToAssociate; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const datasetName = await generate_unique_dataset_name({ token: adminToken, type: 'RAW_DATA' });
        // eslint-disable-next-line no-await-in-loop
        const dataset = await createDataset({
          token: adminToken,
          data: {
            name: datasetName,
            type: 'RAW_DATA',
            origin_path: `/path/to/${datasetName}`,
          },
        });
        datasetsToAssociateWithTestProject.push(dataset);
      }
      // Associate the Datasets with the Project
      await editProjectDatasets({
        token: adminToken,
        id: testProject.id,
        data: {
          add_dataset_ids: datasetsToAssociateWithTestProject.map((dataset) => dataset.id),
        },
      });
      // Associate the test User with the Project
      await editProjectUsers({
        token: adminToken,
        id: testProject.id,
        data: {
          user_ids: [testUser.id],
        },
      });

      // Login as the test User
      await page.goto(`${config.baseURL}/auth/iucas?ticket=${testUser.username}`);

      // Visit the dataset uploads page
      await page.goto('/datasetUpload/new');

      // Select files
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });
      // Track selected files metadata
      const files = await trackSelectedFilesMetadata({ page });

      // Store the selected files' information in state
      selectedFiles.push(...files);

      // Click the "Next" button to proceed to the General-Info step
      await navigateToNextStep({ page });

      const datasetTypeSelect = page.getByTestId('upload-metadata-dataset-type-select');
      await expect(datasetTypeSelect).toBeVisible();
      // Get the selected value from the component without clicking
      selectedDatasetType = await datasetTypeSelect.locator('.va-select-content__option').textContent();
      // Remove any leading/trailing whitespace
      selectedDatasetType = selectedDatasetType.trim();

      // Verify that the Projects available to choose from are the ones that
      // are associated with the test user
      const projects = await page.getByTestId('upload-metadata-project-autocomplete').locator('.va-select-content__option').all();
      await expect(projects).toHaveCount(1);
      await expect(projects[0]).toHaveText(testProject.name);
      console.log('projects[0]', projects[0]);
    });
  });
});
