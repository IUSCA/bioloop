const { test, expect } = require('@playwright/test');

const { testIdSelector, elementTestIdLocator, fillText } = require('../../../../utils');
const { getProjectById } = require('../../../../api/project');

const TEST_PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';
const PROJECT_TO_MERGE_ID = '873d15e3-c221-4dc9-9357-2845d7fa25e2';
// const SEARCH_TEXT = 'project_name_to_merge';

const TEST_ID_PROJECT_MERGE_BUTTON = 'merge-projects-button';
const TEST_ID_PROJECT_MERGE_MODAL = 'merge-projects-modal';
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE = 'project-search-autocomplete';

test.describe.serial('Project-datasets table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}`);
  });

  test('Project Merge', async ({ page }) => {
    const apiRequestContext = page.request;
    const token = await page.evaluate(() => localStorage.getItem('token'));

    const getProjectResponse = await getProjectById({
      requestContext: apiRequestContext,
      token,
      id: PROJECT_TO_MERGE_ID,
    });
    const projectResults = await getProjectResponse.json();
    const project = projectResults.projects[0];

    const searchInputLocator = elementTestIdLocator(
      { testId: TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE },
    );

    await fillText({
      locator: searchInputLocator,
      // exclude the last character, so that the ProjectSearch searches by
      // a matching name (which is how a user would search), instead of the
      // exact name of the project
      text: project.name.slice(0, project.name.length - 1),
    });
  });
});
