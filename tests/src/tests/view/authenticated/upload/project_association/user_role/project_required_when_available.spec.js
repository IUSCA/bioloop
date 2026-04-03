import { getAutoCompleteResults, setCheckboxState, selectAutocompleteResult } from '../../../../../../actions';
import { selectFiles } from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { createProject, editProjectUsers, generateUniqueProjectName } from '../../../../../../api/project';
import { createTestUser } from '../../../../../../api/user';
import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page;
  let role;
  let userWithProject;
  let ownedProjectName;
  let associatedProjectName;

  const resolveE2eRole = (testInfo) => {
    const fromMeta = testInfo.project.metadata?.e2eRole;
    if (fromMeta && ['admin', 'operator', 'user'].includes(fromMeta)) {
      return fromMeta;
    }
    const [candidate] = testInfo.project.name.split('_');
    return ['admin', 'operator', 'user'].includes(candidate) ? candidate : null;
  };

  test.describe('General Info step', () => {
    test.beforeAll(async ({ browser, attachmentManager }, testInfo) => {
      role = resolveE2eRole(testInfo);
      test.skip(role !== 'user', 'Runs only for user role.');

      const adminToken = await getTokenByRole({ role: 'admin' });
      userWithProject = await createTestUser({ role: 'user', token: adminToken });
      const associatedProjectOwner = await createTestUser({ role: 'user', token: adminToken });

      ownedProjectName = await generateUniqueProjectName({
        token: adminToken,
        baseName: 'e2e-upload-owned-project',
      });
      associatedProjectName = await generateUniqueProjectName({
        token: adminToken,
        baseName: 'e2e-upload-associated-project',
      });

      const ownedProject = await createProject({
        token: adminToken,
        data: {
          name: ownedProjectName,
          owner_id: userWithProject.id,
        },
      });
      const associatedProject = await createProject({
        token: adminToken,
        data: {
          name: associatedProjectName,
          owner_id: associatedProjectOwner.id,
        },
      });
      await editProjectUsers({
        token: adminToken,
        id: ownedProject.id,
        data: { user_ids: [userWithProject.id] },
      });
      await editProjectUsers({
        token: adminToken,
        id: associatedProject.id,
        data: { user_ids: [associatedProjectOwner.id, userWithProject.id] },
      });

      page = await browser.newPage();
      await page.goto(`/auth/iucas?ticket=${userWithProject.username}`);
      await page.goto('/datasets/uploads/new');

      const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
      await selectFiles({ page, filePaths, fileSelectTestId: 'upload-file-select' });
      await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
    });

    test('user with available projects must pick a Project before Next is enabled', async () => {
      await setCheckboxState({
        page,
        testId: 'upload-metadata-assign-source-checkbox',
        state: false,
      });
      await setCheckboxState({
        page,
        testId: 'upload-metadata-assign-instrument-checkbox',
        state: false,
      });

      await expect(page.getByTestId('upload-metadata-assign-project-checkbox')).toBeDisabled();
      await expect(page.getByTestId('upload-next-button')).toBeDisabled();

      const projectOptions = await getAutoCompleteResults({
        page,
        testId: 'upload-metadata-project-autocomplete',
      });
      expect(projectOptions).toContain(ownedProjectName);
      expect(projectOptions).not.toContain(associatedProjectName);

      await selectAutocompleteResult({
        page,
        testId: 'upload-metadata-project-autocomplete',
        resultText: ownedProjectName,
        verify: true,
      });

      await expect(page.getByTestId('upload-next-button')).toBeEnabled();
    });
  });
});
