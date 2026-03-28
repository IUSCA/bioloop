import { getAutoCompleteResults, setCheckboxState, selectAutocompleteResult } from '../../../../actions';
import { navigateToNextStep } from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import {
  createProject,
  editProjectUsers,
  generateUniqueProjectName,
  getProjectById,
} from '../../../../api/project';
import { createTestUser } from '../../../../api/user';
import { expect, test } from '../../../../fixtures';
import { getTokenByRole } from '../../../../fixtures/auth';

const FILE_AUTOCOMPLETE_TEST_ID = 'import-file-autocomplete';
const NEXT_BUTTON_TEST_ID = 'import-next-button';

test.describe.serial('Dataset Import — user project association rules', () => {
  let role;
  let adminToken;
  let userWithProject;
  let userWithoutProject;
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

  const proceedToGeneralInfo = async (page) => {
    await page.goto('/datasets/import');
    const sourceSelectVisible = await page.getByTestId('import-source-select').isVisible().catch(() => false);
    test.skip(!sourceSelectVisible, 'Import feature is not enabled for this role/project.');

    await page.click(`input[data-testid="${FILE_AUTOCOMPLETE_TEST_ID}"]`);
    const resultList = page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-results-ul`);
    await expect(resultList).toBeVisible();
    const resultCount = await page
      .locator(`[data-testid^="${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-"]`)
      .count();
    test.skip(resultCount === 0, 'No import directories available in test environment.');

    await page.getByTestId(`${FILE_AUTOCOMPLETE_TEST_ID}--search-result-li-0`).click();
    await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
  };

  test.beforeAll(async ({ browser }, testInfo) => {
    role = resolveE2eRole(testInfo);
    test.skip(role !== 'user', 'Runs only for user role.');

    adminToken = await getTokenByRole({ role: 'admin' });
    userWithProject = await createTestUser({ role: 'user', token: adminToken });
    userWithoutProject = await createTestUser({ role: 'user', token: adminToken });
    const associatedProjectOwner = await createTestUser({ role: 'user', token: adminToken });

    ownedProjectName = await generateUniqueProjectName({
      token: adminToken,
      baseName: 'e2e-import-owned-project',
    });
    associatedProjectName = await generateUniqueProjectName({
      token: adminToken,
      baseName: 'e2e-import-associated-project',
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
  });

  test('user with available projects must pick a Project before Next is enabled', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`/auth/iucas?ticket=${userWithProject.username}`);
    await proceedToGeneralInfo(page);

    await setCheckboxState({
      page,
      testId: 'import-metadata-assign-source-checkbox',
      state: false,
    });
    await setCheckboxState({
      page,
      testId: 'import-metadata-assign-instrument-checkbox',
      state: false,
    });

    await expect(page.getByTestId('import-metadata-assign-project-checkbox')).toBeDisabled();
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeDisabled();

    const projectOptions = await getAutoCompleteResults({
      page,
      testId: 'import-metadata-project-autocomplete',
    });
    expect(projectOptions).toContain(ownedProjectName);
    expect(projectOptions).not.toContain(associatedProjectName);

    await selectAutocompleteResult({
      page,
      testId: 'import-metadata-project-autocomplete',
      resultText: ownedProjectName,
      verify: true,
    });

    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
  });

  test('user without projects auto-creates a project on import and links to it', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`/auth/iucas?ticket=${userWithoutProject.username}`);
    await proceedToGeneralInfo(page);

    await setCheckboxState({
      page,
      testId: 'import-metadata-assign-source-checkbox',
      state: false,
    });
    await setCheckboxState({
      page,
      testId: 'import-metadata-assign-instrument-checkbox',
      state: false,
    });

    const selectedDatasetTypeText = (await page
      .locator('[data-testid="import-metadata-dataset-type-select"] .va-select-content__option')
      .textContent() || '').trim();

    await expect(page.getByTestId('import-metadata-assign-project-checkbox')).toBeDisabled();
    await navigateToNextStep({ page, nextButtonTestId: NEXT_BUTTON_TEST_ID });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const uniqueDatasetName = await generateUniqueDatasetName({
      requestContext: page.request,
      token,
      type: selectedDatasetTypeText,
    });

    await page.getByTestId('dataset-name-input').fill(uniqueDatasetName);
    await expect(page.getByTestId(NEXT_BUTTON_TEST_ID)).toBeEnabled();
    await page.getByTestId(NEXT_BUTTON_TEST_ID).click();

    await expect(page.getByText('Initiated dataset import')).toBeVisible({ timeout: 15000 });

    const projectLink = page.locator('tr:has-text("Project") a[href^="/projects/"]');
    await expect(projectLink).toBeVisible();
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
    expect(createdProject.owner_id).toBe(userWithoutProject.id);

    const [projectPage] = await Promise.all([
      page.context().waitForEvent('page'),
      projectLink.click(),
    ]);
    await projectPage.waitForLoadState('domcontentloaded');
    await projectPage.waitForURL((url) => {
      try {
        return new URL(url).pathname === projectHref;
      } catch (_error) {
        return false;
      }
    });

    const projectDatasetsTable = projectPage.getByTestId('project-datasets-table');
    await expect(projectDatasetsTable).toBeVisible();
    const datasetRow = projectDatasetsTable.locator('tbody tr').filter({ hasText: uniqueDatasetName });
    await expect(datasetRow.first()).toBeVisible();
  });
});
