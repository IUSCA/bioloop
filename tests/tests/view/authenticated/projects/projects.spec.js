const { test, expect } = require('@playwright/test');
const config = require('config');
const { queryParamsToURL } = require('../../../../utils');

const PROJECT_URL_PREFIX = 'projects';
const SEARCH_TEXT = 'sense';
const DEFAULT_QUERY_PARAMS = {
  take: 25,
  skip: 0,
  sortBy: 'updated_at',
  sort_order: 'desc',
};

let currentRequestQueryParams = DEFAULT_QUERY_PARAMS;
let pageCurrentNetworkRequestURL;
let currentApiSearchURL;

const searchProjects = async ({
  requestContext, token, params,
}) => requestContext.get('/api/projects/all', {
  params,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const requestListener = (request) => {
  console.log('addRequestListener called');
  // pageCurrentNetworkRequestURL will hold the URL of the current network
  // request made by the page.
  const queryParams = queryParamsToURL(currentRequestQueryParams);
  console.log(`request.url(): ${request.url()}`);
  const appApiURL = `${config.baseURL}/api/${PROJECT_URL_PREFIX}`.concat(`${!queryParams}` ? '' : `?${queryParams}`);
  console.log(`App API URL: ${appApiURL}`);
  // test only cares about the search request made to the app API. Ignore
  // other network requests like fetching assets, images, etc.
  if (request.url() === appApiURL) {
    pageCurrentNetworkRequestURL = request.url();
    console.log(`pageLastNetworkRequestURL: ${pageCurrentNetworkRequestURL}`);
  } else if (pageCurrentNetworkRequestURL) {
    console.log(`pageLastNetworkRequestURL: ${pageCurrentNetworkRequestURL}`);
  }
};

const addRequestListener = (page) => {
  page.on('request', requestListener);
};

const removeRequestListener = (page) => {
  page.removeListener('request', requestListener);
};

test('project search', async ({ page }) => {
  // listener for network requests made by the page
  addRequestListener(page);

  await page.goto('/projects');

  // Playwright API context for making network requests
  const apiRequestContext = page.request;

  // retrieve token for making API calls
  const token = await page.evaluate(() => localStorage.getItem('token'));

  // retrieve projects expected to be returned by the search API when the page
  // loads, when no search text is provided.
  const onLoadProjectSearchResponse = await searchProjects({
    requestContext: apiRequestContext,
    params: DEFAULT_QUERY_PARAMS,
    token,
  });

  currentApiSearchURL = queryParamsToURL(currentRequestQueryParams);
  // verify that the search URL used for verifying search results is the same
  // as the search URL used by the page in this test
  await expect(currentApiSearchURL).toEqual(pageCurrentNetworkRequestURL);

  const onLoadProjectSearchResults = await onLoadProjectSearchResponse.json();

  // retrieve projects expected to be returned by the search API when search
  // text is provided, to compare the actual search results with later
  currentRequestQueryParams = { ...DEFAULT_QUERY_PARAMS, searchText: SEARCH_TEXT };
  const projectSearchResponse = await searchProjects({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });

  currentApiSearchURL = queryParamsToURL(currentRequestQueryParams);
  // verify that the search URL used for verifying search results is the same
  // as the search URL used by the page in this test
  await expect(currentApiSearchURL).toEqual(pageCurrentNetworkRequestURL);

  const projectsSearchResults = await projectSearchResponse.json();
  const expectedSearchResults = projectsSearchResults.projects;

  const searchResultsLocator = page.locator('table[data-testid="project-search-results"] > tbody > tr');

  // verify default search results
  let searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(onLoadProjectSearchResults.metadata.count));

  // todo - compare UI's search URL with the expected search URL
  await page.getByTestId('project-search-input').fill(SEARCH_TEXT);
  // todo - remove waitForTimeout, wait for DOM updates instead
  await page.waitForTimeout(100);

  searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(projectsSearchResults.metadata.count));

  const returnedProject = await searchResultsLocator.nth(0).locator('td').getByRole('link');
  const projectURL = await returnedProject.getAttribute('href');

  expect(projectURL).toEqual(`${PROJECT_URL_PREFIX}/${expectedSearchResults[0].slug}`);
  await expect(returnedProject).toHaveText(expectedSearchResults[0].name, {
    ignoreCase: false,
  });

  removeRequestListener();
});
