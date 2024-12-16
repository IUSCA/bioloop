const { test, expect } = require('@playwright/test');
const config = require('config');
const { queryParamsToURL } = require('../../../../utils');
const { getAll } = require('../../../../api/project');

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

// persists the URL of the current network request made by the page within this
// test.
const requestListener = (request) => {
  console.log('---');
  // console.log('addRequestListener called');
  // pageCurrentNetworkRequestURL will hold the URL of the current network
  // request made by the page.
  // console.log('currentRequestQueryParams', currentRequestQueryParams);
  const queryParams = queryParamsToURL(currentRequestQueryParams);
  console.log('queryParams', queryParams);
  console.log(`request.url(): ${request.url()}`);
  const projectSearchApiURL = `${config.baseURL}/api/${PROJECT_URL_PREFIX}/all`.concat(!queryParams ? '' : `?${queryParams}`);
  console.log(`App API URL: ${projectSearchApiURL}`);

  // test only cares about the search request made to the app API. Ignore
  // other network requests like fetching assets, images, etc.
  if (request.url() === projectSearchApiURL) {
  // TODO 12/16/24 - pageCurrentNetworkRequestURL is not being persisted
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

  const onLoadSearchApiURL = queryParamsToURL(currentRequestQueryParams);
  // verify that the search URL used for verifying search results is the same
  // as the search URL used by the page in this test
  console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);
  console.log('onLoadSearchApiURL:', onLoadSearchApiURL);
  expect(onLoadSearchApiURL).toEqual(pageCurrentNetworkRequestURL);
  // retrieve projects expected to be returned by the search API when the page
  // loads, when no search text is provided.
  const onLoadProjectSearchResponse = await getAll({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });
  const onLoadProjectSearchResults = await onLoadProjectSearchResponse.json();
  console.log('onLoadProjectSearchResults:', onLoadProjectSearchResults);

  // retrieve projects expected to be returned by the search API when search
  // text is provided, to compare the actual search results with later
  currentRequestQueryParams = { ...DEFAULT_QUERY_PARAMS, searchText: SEARCH_TEXT };
  const projectSearchResponse = await getAll({
    requestContext: apiRequestContext,
    params: currentRequestQueryParams,
    token,
  });
  const projectsSearchResults = await projectSearchResponse.json();
  console.log('projectsSearchResults:', projectsSearchResults);

  const searchApiURL = queryParamsToURL(currentRequestQueryParams);
  console.log('searchApiURL:', searchApiURL);
  console.log('pageCurrentNetworkRequestURL:', pageCurrentNetworkRequestURL);
  // verify that the search URL used for verifying search results is the same
  // as the search URL used by the page in this test
  await expect(currentApiSearchURL).toEqual(pageCurrentNetworkRequestURL);

  const expectedSearchResults = projectsSearchResults.projects;
  console.log('expectedSearchResults:', expectedSearchResults);

  // const searchResultsLocator =
  // page.locator('table[data-testid="project-search-results"] > tbody > tr');
  //
  // // verify default search results
  // let searchResults = await searchResultsLocator;
  // await
  // expect(searchResults).toHaveCount(Number(onLoadProjectSearchResults.metadata.count));
  //
  // // todo - compare UI's search URL with the expected search URL
  // await page.getByTestId('project-search-input').fill(SEARCH_TEXT);
  // // todo - remove waitForTimeout, wait for DOM updates instead
  // await page.waitForTimeout(100);
  //
  // searchResults = await searchResultsLocator;
  // await
  // expect(searchResults).toHaveCount(Number(projectsSearchResults.metadata.count));
  //
  // const returnedProject = await
  // searchResultsLocator.nth(0).locator('td').getByRole('link'); const
  // projectURL = await returnedProject.getAttribute('href');
  //
  // expect(projectURL).toEqual(`${PROJECT_URL_PREFIX}/${expectedSearchResults[0].slug}`);
  // await expect(returnedProject).toHaveText(expectedSearchResults[0].name, {
  //   ignoreCase: false,
  // });

  removeRequestListener();
});
