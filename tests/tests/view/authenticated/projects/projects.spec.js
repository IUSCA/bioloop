const { test, expect } = require('@playwright/test');

const PROJECT_URL_PREFIX = '/projects';
const SEARCH_TEXT = 'sense';
let defaultSearchURL;
let searchURL;

const searchProjects = async ({ requestContext, token, searchText }) => requestContext.get('/api/projects/all', {
  params: {
    ...(!!searchText && { search: searchText }),
    take: 25,
    skip: 0,
    sortBy: 'updated_at',
    sort_order: 'desc',
  },
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const addRequestListener = (page) => {
  // todo - searchURL is only set when a search request is made, not when the
  //   page initially loads
  page.on('request', (request) => {
    searchURL = request.url();
    console.log(`Search request: ${request.url()}`);
  });
};

test('project search', async ({ page }) => {
  await page.goto('/projects');

  // addRequestListener(page);

  // retrieve token for making API calls
  const token = await page.evaluate(() => localStorage.getItem('token'));
  // create context for making API calls
  const apiRequestContext = page.request;
  // retrieve projects expected to be returned by the search API when no search
  // text is provided
  const apiDefaultProjectsResponse = await searchProjects({
    requestContext: apiRequestContext,
    token,
  });
  const apiDefaultSearchResults = await apiDefaultProjectsResponse.json();
  // retrieve projects expected to be returned by the search API when search
  // text is provided, to compare the actual search results with later
  const apiSearchProjectsResponse = await searchProjects({
    requestContext: apiRequestContext,
    searchText: SEARCH_TEXT,
    token,
  });
  const apiExpectedSearchResults = await apiSearchProjectsResponse.json();
  const expectedSearchResults = apiExpectedSearchResults.projects;

  const searchResultsLocator = page.locator('table[data-testid="project-search-results"] > tbody > tr');

  // verify default search results
  let searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(apiDefaultSearchResults.metadata.count));

  // todo - compare UI's search URL with the expected search URL
  await page.getByTestId('project-search-input').fill(SEARCH_TEXT);
  await page.waitForTimeout(100);

  searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(apiExpectedSearchResults.metadata.count));

  const returnedProject = await searchResultsLocator.nth(0).locator('td').getByRole('link');
  const projectURL = await returnedProject.getAttribute('href');

  expect(projectURL).toEqual(`${PROJECT_URL_PREFIX}/${expectedSearchResults[0].slug}`);
  await expect(returnedProject).toHaveText(expectedSearchResults[0].name, {
    ignoreCase: false,
  });
});
