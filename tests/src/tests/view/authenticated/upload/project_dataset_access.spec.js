import { getAutoCompleteResults } from '../../../../actions';
import { selectFiles } from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { createDataset } from '../../../../api/dataset';
import { createProject, editProjectDatasets, editProjectUsers } from '../../../../api/project';
import { createTestUser } from '../../../../api/user';
import { expect, test } from '../../../../fixtures';
import { getTokenByRole } from '../../../../fixtures/auth';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let testPage;
  let role;
  let roleUser;

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

  const resolveE2eRole = (testInfo) => {
    const fromMeta = testInfo.project.metadata?.e2eRole;
    if (fromMeta && ['admin', 'operator', 'user'].includes(fromMeta)) {
      return fromMeta;
    }
    const [candidate] = testInfo.project.name.split('_');
    return ['admin', 'operator', 'user'].includes(candidate) ? candidate : null;
  };

  const setup = async ({ selectedRole }) => {
    const adminToken = await getTokenByRole({ role: 'admin' });

    roleUser = await createTestUser({ role: selectedRole, token: adminToken });

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
        user_ids: [roleUser.id],
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
    test.beforeAll(async ({ browser, attachmentManager }, testInfo) => {
      role = resolveE2eRole(testInfo);
      test.skip(!role, `Unable to resolve e2e role for project ${testInfo.project.name}`);

      // Setup the test conditions for this role.
      await setup({ selectedRole: role });

      testPage = await browser.newPage();
      await testPage.goto(`/auth/iucas?ticket=${roleUser.username}`);
      await testPage.goto('/datasetUpload/new');

      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page: testPage, filePaths, fileSelectTestId: 'upload-file-select' });
      await navigateToNextStep({ page: testPage, nextButtonTestId: 'upload-next-button' });
    });

    test('should enforce role-based Source Raw Data options', async () => {
      const sourceRawDataOptions = await getAutoCompleteResults({
        page: testPage,
        testId: 'upload-metadata-dataset-autocomplete',
      });

      datasetsAssociatedWithUserProject.forEach((dataset) => {
        expect(sourceRawDataOptions).toContain(dataset.name);
      });

      if (role === 'user') {
        expect(sourceRawDataOptions).toHaveLength(datasetsAssociatedWithUserProject.length);
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).not.toContain(dataset.name);
        });
      } else {
        expect(sourceRawDataOptions.length).toBeGreaterThanOrEqual(
          datasetsAssociatedWithUserProject.length,
        );
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
      }
    });

    test('should enforce role-based Project options', async () => {
      const projectOptions = await getAutoCompleteResults({
        page: testPage,
        testId: 'upload-metadata-project-autocomplete',
      });

      if (role === 'user') {
        expect(projectOptions).toHaveLength(1);
        expect(projectOptions[0]).toBe(projectAssociatedWithUserRole.name);
      } else {
        expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
        expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
      }
    });

    test.afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });
  });
});
