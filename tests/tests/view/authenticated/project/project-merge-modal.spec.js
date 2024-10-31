const { test, expect } = require('@playwright/test');

const { testIdSelector, elementTestIdSelector, fillText } = require('../../../../utils');
const { getProjectById } = require('../../../../api/project');

const TEST_PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';
const PROJECT_TO_MERGE_ID = '873d15e3-c221-4dc9-9357-2845d7fa25e2';
// const SEARCH_TEXT = 'project_name_to_merge';

const TEST_ID_PROJECT_MERGE_BUTTON = 'merge-projects-button';
const TEST_ID_PROJECT_MERGE_MODAL = 'merge-projects-modal';
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE = 'project-search-autocomplete';
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE_CONTAINER = `${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE}--container`;
const TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE_SEARCH_RESULTS_UL = `${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE}--search-results-ul`;
// const SEARCH_RESULT = '--search-result-';

test.describe.serial('Project-datasets table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}`);
  });

  test('Project Merge', async ({ page }) => {
    const apiRequestContext = page.request;
    const token = await page.evaluate(() => localStorage.getItem('token'));
    console.log('test token: ', token);

    const getProjectResponse = await getProjectById({
      requestContext: apiRequestContext,
      token,
      id: PROJECT_TO_MERGE_ID,
      test: '1',
    });
    const project = await getProjectResponse.json();

    const searchInputSelector = elementTestIdSelector(
      { testId: TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE },
    );

    await fillText({
      locator: searchInputSelector,
      // exclude the last character, so that the ProjectSearch searches by
      // a matching name (which is how a user would search), instead of the
      // exact name of the project
      text: project.name.slice(0, project.name.length - 1),
    });

    // const autoCompleteLocator = elementTestIdSelector({ testId:
    // TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE });
    const autoCompleteContainerSelector = elementTestIdSelector({ testId: `${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE_CONTAINER}` });
    const autoCompleteContainerUnorderedListSelector = elementTestIdSelector({ testId: `${TEST_ID_PROJECT_SEARCH_AUTOCOMPLETE_SEARCH_RESULTS_UL}` });

    const resultsElementSelector = `${autoCompleteContainerSelector} ${autoCompleteContainerUnorderedListSelector} li`;

    await expect(page.locator(resultsElementSelector)).toHaveText(project.name);
  });
});
