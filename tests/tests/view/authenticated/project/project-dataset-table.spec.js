const { test, expect } = require('@playwright/test');

const PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';

test.describe.serial('Project-datasets table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);
  });

  test('Pagination', async ({ page }) => {
    // Playwright API context for making network requests
    const apiRequestContext = page.request;

    const token = await page.evaluate(() => localStorage.getItem('token'));

    const appDatasetsQueryResponse = await queryDatasets({
      requestContext: apiRequestContext,
      token,
    });
    const appDatasetsQueryResults = await appDatasetsQueryResponse.json();
    const appDatasets = appDatasetsQueryResults.datasets;

    // remove all datasets from the project
    await editProjectDatasets({
      requestContext: apiRequestContext,
      projectId: PROJECT_ID,
      data: {
        remove_dataset_ids: appDatasets.map((ds) => ds.id),
      },
      token,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination]')).not.toBeVisible();

    // add one dataset to verify that the count / results-per-page options are
    // visible
    let datasetsToAdd = [1];
    await editProjectDatasets({
      requestContext: apiRequestContext,
      projectId: PROJECT_ID,
      data: {
        add_dataset_ids: datasetsToAdd,
      },
      token,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination]')).toBeVisible();
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).not.toBeVisible();

    // find datasets that are not part of this project
    datasetsToAdd = appDatasets
      .map((ds) => ds.id).filter((id) => (!datasetsToAdd.includes(id)));
    // add these datasets to the project
    await editProjectDatasets({
      requestContext: apiRequestContext,
      projectId: PROJECT_ID,
      data: {
        add_dataset_ids: datasetsToAdd,
      },
      token,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).toBeVisible();
  });
});

const queryDatasets = async ({
  requestContext, token, params,
}) => requestContext.get('/api/datasets', {
  params,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const editProjectDatasets = async ({
  requestContext, token, projectId, data,
}) => requestContext.patch(`/api/projects/${projectId}/datasets`, {
  data,
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
