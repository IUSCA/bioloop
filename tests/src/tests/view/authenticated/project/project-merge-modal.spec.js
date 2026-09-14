const { test, expect } = require('@playwright/test');

const { getProjectById } = require('../../../../api/project');

const TEST_PROJECT_ID = 'D77C44B9-3905-4DC2-ACB0-BA285361755A';
const PROJECT_TO_MERGE_ID = '69EF006F-53E0-432A-87F4-AECBD181FFE8';

const TEST_ID_PROJECT_MERGE_BUTTON = 'merge-projects-button';
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE = 'project-search-autocomplete';

test.describe.serial('Project merge modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}`);
  });

  test('Project Merge', async ({ page }) => {
    const apiRequestContext = page.request;
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // get details of the project to be merged
    const getProjectResponse = await getProjectById({
      requestContext: apiRequestContext,
      token,
      id: PROJECT_TO_MERGE_ID,
    });
    expect(getProjectResponse.ok()).toBeTruthy();

    const projectToMerge = await getProjectResponse.json();

    // open project merge modal
    await page.getByTestId(TEST_ID_PROJECT_MERGE_BUTTON).click();

    const searchInput = page.getByTestId(TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE);
    await searchInput.click();
    // In search input, enter text matching - but not equal to - the name of
    // the project to be merged. This verifies that the project search works by
    // matching and not exact project names.
    await searchInput.fill(projectToMerge.name.slice(0, projectToMerge.name.length - 1));

    // TODO - assert that any results (instead of first) contain expected result
    const resultsElementLocator = page
      .locator(`[data-testid*=${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE}--search-result-li]`)
      .first();
    await expect(resultsElementLocator).toContainText(projectToMerge.name);
  });
});
