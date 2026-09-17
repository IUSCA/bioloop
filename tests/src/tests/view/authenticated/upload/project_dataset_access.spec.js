import { getAutoCompleteResults } from '../../../../actions';
import { loginAndNavigate } from '../../../../actions/auth';
import { selectFilesAndGoToGeneralInfo } from '../../../../actions/datasetUpload';
import { createDataset } from '../../../../api/dataset';
import {
  createProject,
  editProjectDatasets,
  editProjectUsers,
} from '../../../../api/project';
import { ensureRoleUser } from '../../../../api/user';
import { expect, test } from '../../../../fixtures';
import { getTokenByRole } from '../../../../fixtures/auth';
import { getUploadEnabledRoles } from '../../../../config/featureRoles';

const uploadEnabledForRoles = getUploadEnabledRoles();

const attachments = Array.from(
  { length: 3 },
  (_, i) => ({ name: `file_${i + 1}` }),
);

test.use({ attachments });

async function openGeneralInfoForRole({
  browser,
  attachmentManager,
  role,
}) {
  const page = await browser.newPage();

  await loginAndNavigate({
    page,
    ticket: role,
    path: '/datasets/uploads/new',
    waitForTestId: 'upload-container',
  });

  const filePaths = attachments.map(
    (file) => `${attachmentManager.getPath()}/${file.name}`,
  );
  await selectFilesAndGoToGeneralInfo({ page, filePaths });

  return page;
}

test.describe.serial('Dataset Upload Project and Dataset access', () => {
  const projects = [];
  const datasetsAssociatedWithUserProject = [];
  const datasetsNotAssociatedWithUserProject = [];
  let projectAssociatedWithUserRole;

  test.beforeAll(async () => {
    const adminToken = await getTokenByRole({ role: 'admin' });

    const createdProjects = await Promise.all(
      Array.from(
        { length: 2 },
        () => createProject({ token: adminToken }),
      ),
    );
    projects.push(...createdProjects);
    [projectAssociatedWithUserRole] = projects;

    const associatedDatasets = await Promise.all(
      Array.from(
        { length: 3 },
        () => createDataset({
          token: adminToken,
          data: { type: 'RAW_DATA' },
        }),
      ),
    );
    datasetsAssociatedWithUserProject.push(...associatedDatasets);

    await editProjectDatasets({
      token: adminToken,
      id: projectAssociatedWithUserRole.id,
      data: {
        add_dataset_ids: datasetsAssociatedWithUserProject.map(
          (dataset) => dataset.id,
        ),
      },
    });
    if (uploadEnabledForRoles.includes('user')) {
      const user = await ensureRoleUser({ token: adminToken, role: 'user' });
      await editProjectUsers({
        token: adminToken,
        id: projectAssociatedWithUserRole.id,
        data: { user_ids: [user.id] },
      });
    }

    datasetsNotAssociatedWithUserProject.push(await createDataset({
      token: adminToken,
      data: { type: 'RAW_DATA' },
    }));
  });

  if (uploadEnabledForRoles.includes('user')) {
    test.describe('user role access', () => {
      let page;

      test.beforeAll(async ({ browser, attachmentManager }) => {
        page = await openGeneralInfoForRole({
          browser,
          attachmentManager,
          role: 'user',
        });
      });

      test('only lists source datasets from an associated Project', async () => {
        const sourceRawDataOptions = await getAutoCompleteResults({
          page,
          testId: 'upload-metadata-dataset-autocomplete',
        });

        datasetsAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).toContain(dataset.name);
        });
        datasetsNotAssociatedWithUserProject.forEach((dataset) => {
          expect(sourceRawDataOptions).not.toContain(dataset.name);
        });
      });

      test('only lists Projects associated with the user', async () => {
        const projectOptions = await getAutoCompleteResults({
          page,
          testId: 'upload-metadata-project-autocomplete',
        });

        expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
      });

      test.afterAll(async () => {
        await page?.close();
      });
    });
  }

  ['operator', 'admin']
    .filter((role) => uploadEnabledForRoles.includes(role))
    .forEach((role) => {
      test.describe(`${role} role access`, () => {
        let page;

        test.beforeAll(async ({ browser, attachmentManager }) => {
          page = await openGeneralInfoForRole({
            browser,
            attachmentManager,
            role,
          });
        });

        test('lists source datasets regardless of Project association', async () => {
          const sourceRawDataOptions = await getAutoCompleteResults({
            page,
            testId: 'upload-metadata-dataset-autocomplete',
          });

          expect(sourceRawDataOptions.length).toBeGreaterThanOrEqual(
            datasetsAssociatedWithUserProject.length,
          );
          datasetsAssociatedWithUserProject.forEach((dataset) => {
            expect(sourceRawDataOptions).toContain(dataset.name);
          });
          datasetsNotAssociatedWithUserProject.forEach((dataset) => {
            expect(sourceRawDataOptions).toContain(dataset.name);
          });
        });

        test('lists all Projects', async () => {
          const projectOptions = await getAutoCompleteResults({
            page,
            testId: 'upload-metadata-project-autocomplete',
          });

          expect(projectOptions.length).toBeGreaterThanOrEqual(projects.length);
          expect(projectOptions).toContain(projectAssociatedWithUserRole.name);
        });

        test.afterAll(async () => {
          await page?.close();
        });
      });
    });
});
