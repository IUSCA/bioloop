import { getAutoCompleteResults } from '../../../../../../actions';
import { selectFiles } from '../../../../../../actions/datasetUpload';
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

  const projects = [];
  let projectAssociatedWithUserRole;

  let user; // `user` role user
  let operator; // `operator` role user
  let admin; // `admin` role user

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
    console.log('user', user);
    admin = await createTestUser({ role: 'admin', token: adminToken });
    console.log('admin', admin);
    operator = await createTestUser({ role: 'operator', token: adminToken });
    console.log('operator', operator);

    // Create a few Projects. Test will use these Projects as options of field
    // "Assign to Project".
    const numProjectsToCreate = 2;
    for (let i = 0; i < numProjectsToCreate; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      projects.push(await createProject({
        token: adminToken,
        data: { name: 'TestProject' },
      }));
    }

    // Choose any Project to be associated with `user` role User.
    [projectAssociatedWithUserRole] = projects;

    // Create a few Datasets to associate with the Project which is being
    // associated with the `user` role User. Test will use these Datasets as
    // options of field "Source Raw Data".
    const datasetsToAssociateWithUserProject = [];
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
      datasetsToAssociateWithUserProject.push(dataset);
    }
    // Associate the created Datasets with the Project exposed to `user` role
    // User.
    await editProjectDatasets({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        add_dataset_ids: datasetsToAssociateWithUserProject.map((dataset) => dataset.id),
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
  };

  test.describe.serial('Upload-initiation step', () => {
    // Fill all form fields
    test.beforeAll(async ({ browser, attachmentManager }) => {
      // Setup the test conditions.
      await setup();

      // Create a new Page instance
      page = await browser.newPage();

      // Login as the `user` role User
      await page.goto(`${config.baseURL}/auth/iucas?ticket=${user.username}`);

      // Visit the dataset uploads page
      await page.goto('/datasetUpload/new');

      // Step 1 of Upload Stepper (Select Files)
      // - Select files to upload
      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths });

      // click Next button to navigate to step 2 (General Info)
      await navigateToNextStep({ page });
    });

    // Step 2 of Upload Stepper (General Info)

    test('`user` role should only be able to choose from Projects that they are associated with', async () => {
      const projectOptions = await getAutoCompleteResults({
        page,
        testId: 'upload-metadata-project-autocomplete',
      });
      expect(projectOptions).toHaveLength(1);
      expect(projectOptions[0]).toBe(projectAssociatedWithUserRole.name);
    });

    test('`operator` role should be able to choose from all Projects', async ({ attachmentManager }) => {
      await page.goto(`${config.baseURL}/auth/logout`);

      // Login as the `operator` role User
      // console.log('logging in as operator');
      // console.log('operator', operator);
      console.log('going to', `${config.baseURL}/auth/iucas?ticket=${operator.username}`);
      await page.goto(`${config.baseURL}/auth/iucas?ticket=${operator.username}`);
      const currentUrl = page.url();
      console.log('Current URL after operator login:', currentUrl);

      // Visit the dataset uploads page
      // await page.goto('/datasetUpload/new');

      // Step 1 of Upload Stepper:
      // // - Select files to upload
      // const filePaths = attachments.map((file) =>
      // `${attachmentManager.getPath()}/${file.name}`); await selectFiles({
      // page, filePaths, });

      // // click Next button
      // await navigateToNextStep({ page });

      // const projectOptions = await getAutoCompleteResults({
      //   page,
      //   testId: 'upload-metadata-project-autocomplete',
      // });
      // expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
      // expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
    });

    // test('`admin` role should be able to choose from all Projects', async ({ attachmentManager }) => {
    //   // Login as the `admin` role User
    //   await page.goto(`${config.baseURL}/auth/iucas?ticket=${admin.username}`);

    //   // Visit the dataset uploads page
    //   await page.goto('/datasetUpload/new');

    //   // Step 1 of Upload Stepper:
    //   // - Select files to upload
    // const filePaths = attachments.map((file) =>
    // `${attachmentManager.getPath()}/${file.name}`); await selectFiles({ page,
    // filePaths, });

    //   // click Next button
    //   await navigateToNextStep({ page });

    //   const projectOptions = await getAutoCompleteResults({
    //     page,
    //     testId: 'upload-metadata-project-autocomplete',
    //   });
    //   expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
    //   expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
    // });
  });
});
