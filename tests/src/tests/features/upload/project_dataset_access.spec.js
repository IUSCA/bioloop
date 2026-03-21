import { getAutoCompleteResults } from '../../../actions';
import { selectFiles } from '../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../actions/stepper';
import { createDataset } from '../../../api/dataset';
import { createProject, editProjectDatasets, editProjectUsers } from '../../../api/project';
import { createTestUser } from '../../../api/user';
import { expect, test } from '../../../fixtures';
import { getTokenByRole } from '../../../fixtures/auth';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let testPage;
  let role;
  let roleUser;

  const projects = [];
  let projectAssociatedWithUserRole;
  const datasetsAssociatedWithUserProject = [];
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

    const numProjectsToCreate = 2;
    for (let i = 0; i < numProjectsToCreate; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      projects.push(await createProject({
        token: adminToken,
      }));
    }

    [projectAssociatedWithUserRole] = projects;

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
    await editProjectDatasets({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        add_dataset_ids: datasetsAssociatedWithUserProject.map((dataset) => dataset.id),
      },
    });
    await editProjectUsers({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        user_ids: [roleUser.id],
      },
    });

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

      await setup({ selectedRole: role });

      testPage = await browser.newPage();
      await testPage.goto(`/auth/iucas?ticket=${roleUser.username}`);
      await testPage.goto('/datasetUpload/new');

      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page: testPage, filePaths, fileSelectTestId: 'upload-file-select' });
      await navigateToNextStep({ page: testPage, nextButtonTestId: 'upload-next-button' });
    });

    test.describe('User role (scoped project + datasets)', () => {
      test.beforeAll(() => {
        test.skip(role !== 'user', 'These projects run only under user_upload_project_dataset_access');
      });

      test('Source Raw Data autocomplete lists only datasets on the assigned project', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page: testPage,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        expect(sourceRawDataOptions).toHaveLength(datasetsAssociatedWithUserProject.length);
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).not.toContain(dataset.name);
        });
      });

      test('Project autocomplete offers only the assigned project', async () => {
        const projectOptions = await getAutoCompleteResults({
          page: testPage,
          testId: 'upload-metadata-project-autocomplete',
        });

        expect(projectOptions).toHaveLength(1);
        expect(projectOptions[0]).toBe(projectAssociatedWithUserRole.name);
      });
    });

    test.describe('Admin or operator role (broader catalog)', () => {
      test.beforeAll(() => {
        test.skip(role === 'user', 'User role expectations are in the sibling describe block');
      });

      test('Source Raw Data autocomplete includes datasets outside the test project', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page: testPage,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        expect(sourceRawDataOptions.length).toBeGreaterThanOrEqual(
          datasetsAssociatedWithUserProject.length,
        );
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
      });

      test('Project autocomplete lists multiple projects including the test project', async () => {
        const projectOptions = await getAutoCompleteResults({
          page: testPage,
          testId: 'upload-metadata-project-autocomplete',
        });

        expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
        expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
      });
    });

    test.afterAll(async () => {
      if (testPage) {
        await testPage.close();
      }
    });
  });
});
