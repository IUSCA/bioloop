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

// persists the URL of the current network request made by the page within this
// test.
const requestListener = (request) => {
  const queryParams = objectToQueryParams(currentRequestQueryParams);

  const projectSearchApiURLPrefix = `${config.baseURL}/api/${API_RESOURCE}/all`;
  const projectSearchApiURL = projectSearchApiURLPrefix.concat(!queryParams ? '' : `?${queryParams}`);

  // we only care about the network requests issued to localhost
  // if (request.url().startsWith(config.baseURL)) {
  // const projectSearchApiURLPrefix =
  // `${config.baseURL}/api/${API_RESOURCE}/all`; projectSearchApiURL =
  // projectSearchApiURLPrefix.concat(!queryParams ? '' : `?${queryParams}`); }

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
// listens to any network requests made by the page
  page.on('request', requestListener);
};

const removeRequestListener = (page) => {
  page.removeListener('request', requestListener);
};

test('project search', async ({ page }) => {
  // add listener for network requests made by the page
  addRequestListener(page);

  await page.goto('/projects');

  // Playwright API context for making network requests
  const apiRequestContext = page.request;

  // retrieve token which will be used for making API calls through
  // PLaywright's API context
  const token = await page.evaluate(() => localStorage.getItem('token'));

  // search API URL that will be used for verifying search results that are
  // retrieved upon page load
  let searchApiURL = prefixedAppApiPath(
    {
      queryParamsStr: objectToQueryParams(currentRequestQueryParams),
      resourcePrefix: 'projects/all',
    },
  );
  // verify that the search API URL that will be used for verifying initial
  // search results (i.e. results retrieved when the page loads) is the same as
  // the search API URL used by the page fo fetch the initial search results
  // console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);
  // console.log('onLoadSearchApiURL:', onLoadSearchApiURL);
  expect(searchApiURL).toEqual(pageCurrentNetworkRequestURL);
  // retrieve projects expected to be returned by the search API when the page
  // loads, and no search text is provided.
  const expectedOnLoadProjectSearchResponse = await getAll({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });
  const expectedOnLoadProjectSearchResults = await expectedOnLoadProjectSearchResponse.json();
  // console.log('expectedOnLoadProjectSearchResults:',
  // expectedOnLoadProjectSearchResults);

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

  // updated search API URL that will be used for verifying search results
  // when search text is provided
  searchApiURL = prefixedAppApiPath({ queryParamsStr: objectToQueryParams(currentRequestQueryParams), resourcePrefix: 'projects/all' });
  // console.log('searchApiURL:', searchApiURL);

  // TODO (01/06/25) - check and adjust existing tests

  // console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);

  const searchResultsLocator = page.locator('table[data-testid="project-search-results"] > tbody > tr');

  // verify search results that are retrieved upon page load
  let searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(
    Number(expectedOnLoadProjectSearchResults.metadata.count),
  );

  // fill in the search text
  await page.getByTestId('project-search-input').fill(SEARCH_TEXT);
  // verify that the search API URL that will be used for verifying
  // search results when search text is provided, is the same as
  // the search API URL used by the page fo fetch the results retrieved
  // from the search API when search text is provided.
  await expect(searchApiURL).toEqual(pageCurrentNetworkRequestURL);

  // TODO - remove waitForTimeout, wait for DOM updates instead
  await page.waitForTimeout(100);

  // verify search results that are retrieved when search text is provided
  searchResults = await searchResultsLocator;
  await expect(searchResults).toHaveCount(Number(expectedProjectsSearchResults.metadata.count));

  // TODO (01/09/25) - multiple projects can be returned by the search API
  // TODO (01/09/25) - fix existing tests based on recent refactoring
  const resultantProject = expectedProjectsSearchResults.projects[0];
  const resultantProjectLocator = await searchResultsLocator.nth(0).locator('td').getByRole('link');
  const resultantProjectURL = await resultantProjectLocator.getAttribute('href');

  expect(resultantProjectURL).toEqual(`/${API_RESOURCE}/${resultantProject.slug}`);
  // verify that the project retrieved by the search request issued by the page
  // matches the project that is expected to be retrieved.
  await expect(resultantProjectLocator).toHaveText(resultantProject.name, {
    ignoreCase: false,
  });

  removeRequestListener(page);
});
