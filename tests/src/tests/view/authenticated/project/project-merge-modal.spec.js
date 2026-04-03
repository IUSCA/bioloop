const { test, expect } = require('@playwright/test');

const { createProject } = require('../../../../api/project');
const { getTokenByRole } = require('../../../../fixtures/auth');

let testProjectId;
let projectToMergeName;

const TEST_ID_PROJECT_MERGE_BUTTON = 'merge-projects-button';
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE = 'project-search-autocomplete';

test.describe.serial('Project-datasets table', () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(120000);
    const adminToken = await getTokenByRole({ role: 'admin' });
    const [targetProject, mergeProject] = await Promise.all([
      createProject({ requestContext: request, token: adminToken }),
      createProject({ requestContext: request, token: adminToken }),
    ]);
    testProjectId = targetProject.id;
    projectToMergeName = mergeProject.name;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${testProjectId}`);
  });

  test('Project Merge', async ({ page }) => {
    // open project merge modal
    await page.getByTestId(TEST_ID_PROJECT_MERGE_BUTTON).click();

    const searchInput = page.getByTestId(TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE);
    await searchInput.click();
    // In search input, enter text matching - but not equal to - the name of
    // the project to be merged. This verifies that the project search works by
    // matching and not exact project names.
    await searchInput.fill(projectToMergeName.slice(0, projectToMergeName.length - 1));

    // TODO - assert that any results (instead of first) contain expected result
    const resultsElementLocator = page
      .locator(`[data-testid*=${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE}--search-result-li]`)
      .first();
    await expect(resultsElementLocator).toContainText(projectToMergeName);
  });
});
