import { getAutoCompleteResults } from '../../../../actions';
import { selectFiles } from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { createDataset } from '../../../../api/dataset';
import { createProject, editProjectDatasets, editProjectUsers } from '../../../../api/project';
import { createTestUser } from '../../../../api/user';
import { expect, test } from '../../../../fixtures';
import { getTokenByRole } from '../../../../fixtures/auth';

const config = require('config');

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let userPage; // Playwright page instance for `user` role user
  let operatorPage; // Playwright page instance for `operator` role user
  let adminPage; // Playwright page instance for `admin` role user

  let user; // `user` role user
  let operator; // `operator` role user
  let admin; // `admin` role user

  // Projects that will be created, to be used as options of field "Assign
  // Project".
  const projects = [];
  // Project that will be associated with the `user` role User
  let projectAssociatedWithUserRole;
  // Datasets that will be associated with the Project that will be associated
  // with the `user` role User.
  const datasetsAssociatedWithUserProject = [];
  // Datasets that will not be associated with the Project that will be
  // associated with the `user` role User.
  const datasetsNotAssociatedWithUserProject = [];
  /**
   * Setup:
   * - Create a new User. Test will be run while logged-in as this user.
   * - Create a new Project. Test will use this Project.
   * - Create a few Datasets to associate with the Project. Test will use
   *    these Datasets as options of field "Source Raw Data".
   * - Associate the created Datasets with the Project
   * - Associate the test User with the created Project
   */
  const setup = async () => {
    const adminToken = await getTokenByRole({ role: 'admin' });

    user = await createTestUser({ role: 'user', token: adminToken });
    // console.log('created user', user);
    admin = await createTestUser({ role: 'admin', token: adminToken });
    // console.log('created admin', admin);
    operator = await createTestUser({ role: 'operator', token: adminToken });
    // console.log('created operator', operator);

    // Create a few Projects. Test will use these Projects as options of field
    // "Assign Project".
    const numProjectsToCreate = 2;
    for (let i = 0; i < numProjectsToCreate; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      projects.push(await createProject({
        token: adminToken,
      }));
    }

    // Choose any Project to be associated with `user` role User.
    [projectAssociatedWithUserRole] = projects;

    // Create a few Datasets to associate with the Project which is being
    // associated with the `user` role User. Test will use these Datasets as
    // options of field "Source Raw Data".
    const numDatasetsToAssociate = 3;
    for (let i = 0; i < numDatasetsToAssociate; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const dataset = await createDataset({
        token: adminToken,
        data: {
          type: 'RAW_DATA',
        },
      });
      datasetsAssociatedWithUserProject.push(dataset);
    }
    // Associate the created Datasets with the Project exposed to `user` role
    // User.
    await editProjectDatasets({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        add_dataset_ids: datasetsAssociatedWithUserProject.map((dataset) => dataset.id),
      },
    });
    // Associate the `user` role User with the Project
    await editProjectUsers({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        user_ids: [user.id],
      },
    });

    // Create a few more Datasets, which will not be associated with the Project
    // that will be associated with the `user` role User.
    datasetsNotAssociatedWithUserProject.push(await createDataset({
      token: adminToken,
      data: {
        type: 'RAW_DATA',
      },
    }));
  };

  test.describe.serial('Upload-initiation step', () => {
    test.beforeAll(async () => {
      // Setup the test conditions.
      await setup();
    });

    test.describe('`user` role should only be able to choose options from Projects and Datasets that they have access to', () => {
      test.beforeAll(async ({ browser, attachmentManager }) => {
        // Create a new browser instance for logging-in as `user` role User
        userPage = await browser.newPage();

        // Login as the `user` role User
        await userPage.goto(`${config.baseURL}/auth/iucas?ticket=${user.username}`);

        // Visit the dataset uploads page
        await userPage.goto('/datasetUpload/new');

        // - Select files to upload
        const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
        await selectFiles({ page: userPage, filePaths });

        // click Next button
        await navigateToNextStep({ page: userPage });
      });

      test('`user` role should only be able to choose Source Raw Data from Datasets that are associated with Projects that the User is associated with', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page: userPage,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        // Verify results count
        expect(sourceRawDataOptions).toHaveLength(datasetsAssociatedWithUserProject.length);

        // Verify results contents
        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).not.toContain(dataset.name);
        });
      });

      test('`user` role should only be able to choose from Projects that they are associated with', async () => {
        const projectOptions = await getAutoCompleteResults({
          page: userPage,
          testId: 'upload-metadata-project-autocomplete',
        });

        // Verify results count
        expect(projectOptions).toHaveLength(1);

        // Verify results contents
        expect(projectOptions[0]).toBe(projectAssociatedWithUserRole.name);
      });

      test.afterAll(async () => {
        await userPage.close();
      });
    });

    test.describe('`operator` role should be able to choose any Datasets as Source Raw Data, and any Project', () => {
      test.beforeAll(async ({ browser, attachmentManager }) => {
        // Create a new browser instance for logging-in as `operator` role User
        operatorPage = await browser.newPage();

        // Login as the `operator` role User
        await operatorPage.goto(`${config.baseURL}/auth/iucas?ticket=${operator.username}`);

        // Visit the dataset uploads page
        await operatorPage.goto('/datasetUpload/new');

        // - Select files to upload
        const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
        await selectFiles({ page: operatorPage, filePaths });

        // click Next button
        await navigateToNextStep({ page: operatorPage });
      });

      test('`operator` role should be able to choose Source Raw Data from any Datasets, regardless of what Projects they are associated with', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page: operatorPage,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        // Verify results count
        expect(sourceRawDataOptions.length).toBeGreaterThanOrEqual(
          datasetsAssociatedWithUserProject.length,
        );

        // Verify results contents
        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
      });

      test('`operator` role should be able to choose from any Projects', async () => {
        const projectOptions = await getAutoCompleteResults({
          page: operatorPage,
          testId: 'upload-metadata-project-autocomplete',
        });

        // `operator` role should be able to choose from any Projects
        // - Verify results count
        expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
        // - Verify that the Project that is associated with the `user` role
        // User is also available for the operator to choose from.
        expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
      });

      test.afterAll(async () => {
        await operatorPage.close();
      });
    });

    test.describe('`admin` role should be able to choose any Datasets as Source Raw Data, and any Project', async () => {
      test.beforeAll(async ({ browser, attachmentManager }) => {
        // Create a new browser instance for logging-in as `admin` role User
        adminPage = await browser.newPage();

        // Login as the `admin` role User
        await adminPage.goto(`${config.baseURL}/auth/iucas?ticket=${admin.username}`);

        // Visit the dataset uploads page
        await adminPage.goto('/datasetUpload/new');

        // - Select files to upload
        const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
        await selectFiles({ page: adminPage, filePaths });

        // click Next button
        await navigateToNextStep({ page: adminPage });
      });

      test('`admin` role should be able to choose Source Raw Data from any Datasets, regardless of what Projects they are associated with', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page: adminPage,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        // Verify results count
        expect(sourceRawDataOptions.length).toBeGreaterThanOrEqual(
          datasetsAssociatedWithUserProject.length,
        );

        // Verify results contents
        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
      });

      test('`admin` role should be able to choose from any Projects', async () => {
        const projectOptions = await getAutoCompleteResults({
          page: adminPage,
          testId: 'upload-metadata-project-autocomplete',
        });
        // `admin` role should be able to choose from any Projects
        expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
        // Verify that the Project that is associated with the `user` role User
        // is also available for the admin to choose from.
        expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
      });

      test.afterAll(async () => {
        await adminPage.close();
      });
    });
  });
});
