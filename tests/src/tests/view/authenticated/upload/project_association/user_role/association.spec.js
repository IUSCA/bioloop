/**
 * Verifies that a User upload is persisted in a Project explicitly assigned
 * to that User. Fixtures do not depend on pre-existing datasets or projects.
 */
import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
} from '../../../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../../../api/dataset';
import { createProject, editProjectUsers } from '../../../../../../api/project';
import { ensureRoleUser } from '../../../../../../api/user';
import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';
import { submitAndWaitForUploadCompletion } from '../helpers';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));
test.use({ attachments });

test('user upload is associated with their selected Project', async ({
  page,
  attachmentManager,
}) => {
  const adminToken = await getTokenByRole({ role: 'admin' });
  const user = await ensureRoleUser({ token: adminToken, role: 'user' });
  const project = await createProject({ token: adminToken });
  await editProjectUsers({
    token: adminToken,
    id: project.id,
    data: { user_ids: [user.id] },
  });

  await openNewUpload({ page });
  const filePaths = attachments.map(
    (file) => `${attachmentManager.getPath()}/${file.name}`,
  );
  await selectFilesAndGoToGeneralInfo({ page, filePaths });

  // This scenario tests Project association, so it needs no readable source Dataset.
  await selectDropdownOption({
    page,
    testId: 'upload-metadata-dataset-type-select',
    optionToSelect: 'Raw Data',
    verify: true,
  });
  await selectDropdownOption({
    page,
    testId: 'upload-metadata-source-instrument-select',
    optionIndex: 0,
    verify: true,
  });

  const projectInput = page.getByTestId('upload-metadata-project-autocomplete');
  await projectInput.fill(project.name);
  await expect(
    page.getByTestId('upload-metadata-project-autocomplete--search-results-ul'),
  ).toContainText(project.name);
  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-project-autocomplete',
    resultText: project.name,
    verify: true,
  });
  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
  await expect(page.getByTestId('upload-details-dataset-name-input')).toBeVisible();

  const token = await page.evaluate(
    () => globalThis.localStorage.getItem('token'),
  );
  const uploadedDatasetName = await generateUniqueDatasetName({
    requestContext: page.request,
    token,
    type: 'RAW_DATA',
  });
  await page.getByTestId('upload-details-dataset-name-input').fill(uploadedDatasetName);
  await submitAndWaitForUploadCompletion(page);

  const projectLink = page.getByTestId('upload-details-project-link');
  await expect(projectLink).toBeVisible();
  await expect(projectLink).toContainText(project.name);

  const projectHref = await projectLink.getAttribute('href');
  expect(projectHref).toBeTruthy();
  const [projectPage] = await Promise.all([
    page.context().waitForEvent('page'),
    projectLink.click(),
  ]);
  try {
    await projectPage.waitForLoadState('domcontentloaded');
    await projectPage.waitForURL((url) => url.pathname === projectHref);
    const projectDatasetsTable = projectPage.getByTestId('project-datasets-table');
    await expect(projectDatasetsTable).toBeVisible();
    await expect(
      projectDatasetsTable.locator('tbody tr').filter({
        hasText: uploadedDatasetName,
      }).first(),
    ).toBeVisible();
  } finally {
    await projectPage.close();
  }
});
