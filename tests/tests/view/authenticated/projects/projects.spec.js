const { test, expect } = require('@playwright/test');
const config = require('config');
const { objectToQueryParams } = require('../../../../utils');
const { prefixedAppApiPath } = require('../../../../utils/api');
const { getAll } = require('../../../../api/project');

const API_RESOURCE = 'projects';
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

// persists the URL of the current network request made by the page within this
// test.
const requestListener = (request) => {
  // console.log('addRequestListener called');
  // pageCurrentNetworkRequestURL will hold the URL of the current network
  // request made by the page.
  // console.log('currentRequestQueryParams', currentRequestQueryParams);
  const queryParams = objectToQueryParams(currentRequestQueryParams);

  let projectSearchApiURL;

  // we only care about the API requests issued to localhost
  if (request.url().startsWith(config.baseURL)) {
    console.log('---');
    console.log('queryParams', queryParams);
    console.log(`request.url(): ${request.url()}`);
    const projectSearchApiURLPrefix = `${config.baseURL}/api/${API_RESOURCE}/all`;
    projectSearchApiURL = projectSearchApiURLPrefix.concat(!queryParams ? '' : `?${queryParams}`);
    console.log(`projectSearchApiURL: ${projectSearchApiURL}`);
  }

  // test only cares about the search request made to the app API. Ignore
  // other network requests, like the ones for fetching static assets.
  if (request.url().startsWith(projectSearchApiURL)) {
    pageCurrentNetworkRequestURL = request.url();
    console.log(`PERSISTED pageCurrentNetworkRequestURL: ${pageCurrentNetworkRequestURL}`);
  } else if (pageCurrentNetworkRequestURL) {
    // console.log(`IGNORING pageCurrentNetworkRequestURL:
    // ${pageCurrentNetworkRequestURL}`);
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

  // search API URL that will be used for verifying search results
  const onLoadSearchApiURL = prefixedAppApiPath({ queryParamsStr: objectToQueryParams(currentRequestQueryParams), resourcePrefix: 'projects/all' });
  // verify that the search API URL that will be used for verifying search
  // results is the same as the search API URL being used by the page in this
  // test
  console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);
  console.log('onLoadSearchApiURL:', onLoadSearchApiURL);
  expect(onLoadSearchApiURL).toEqual(pageCurrentNetworkRequestURL);
  // retrieve projects expected to be returned by the search API when the page
  // loads, and no search text is provided.
  const expectedOnLoadProjectSearchResponse = await getAll({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });
  const expectedOnLoadProjectSearchResults = await expectedOnLoadProjectSearchResponse.json();
  console.log('expectedOnLoadProjectSearchResults:', expectedOnLoadProjectSearchResults);

  // retrieve projects expected to be returned by the search API when search
  // text is provided, to compare the actual search results with later
  currentRequestQueryParams = { ...DEFAULT_QUERY_PARAMS, search: SEARCH_TEXT };
  const expectedProjectSearchResponse = await getAll({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });
  const expectedProjectsSearchResults = await expectedProjectSearchResponse.json();
  console.log('projectsSearchResults:', expectedProjectsSearchResults);

  // search API URL that will be used for verifying search results
  const searchApiURL = prefixedAppApiPath({ queryParamsStr: objectToQueryParams(currentRequestQueryParams), resourcePrefix: 'projects/all' });
  console.log('searchApiURL:', searchApiURL);

  // TODO (01/06/25) - test needs to perform search before this point
  // TODO (01/06/25) - check and adjust existing tests

  console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);
  // verify that the search URL used for verifying search results is the same
  // as the search URL used by the page in this test
  // TODO (01/06/25) - test fails here

  const searchResultsLocator = page.locator('table[data-testid="project-search-results"] > tbody > tr');

  // verify default search results
  let searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(
    Number(expectedOnLoadProjectSearchResults.metadata.count),
  );

  // todo - compare UI's search URL with the expected search URL
  await page.getByTestId('project-search-input').fill(SEARCH_TEXT);
  await expect(searchApiURL).toEqual(pageCurrentNetworkRequestURL);

  // TODO - remove waitForTimeout, wait for DOM updates instead
  await page.waitForTimeout(100);

  searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(expectedProjectsSearchResults.metadata.count));

  const returnedProject = expectedProjectsSearchResults.projects[0];
  const returnedProjectLocator = await searchResultsLocator.nth(0).locator('td').getByRole('link');
  const returnedProjectURL = await returnedProjectLocator.getAttribute('href');

  expect(returnedProjectURL).toEqual(`/${API_RESOURCE}/${returnedProject.slug}`);
  await expect(returnedProjectLocator).toHaveText(returnedProject.name, {
    ignoreCase: false,
  });

  removeRequestListener(page);
});
