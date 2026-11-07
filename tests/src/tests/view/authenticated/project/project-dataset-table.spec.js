const { test, expect } = require('@playwright/test');

const { editProjectDatasets } = require('../../../../api/project');
const { getDatasets } = require('../../../../api/dataset');

const PROJECT_ID = 'D77C44B9-3905-4DC2-ACB0-BA285361755A';

test.describe.serial('Project-datasets table', () => {
  let token;
  let datasetIds;

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);

    token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    const datasetsResponse = await getDatasets({
      requestContext: page.request,
      token,
    });
    expect(datasetsResponse.ok()).toBeTruthy();

    const { datasets } = await datasetsResponse.json();
    datasetIds = datasets.map((dataset) => dataset.id);
    expect(datasetIds.length).toBeGreaterThan(10);

    const resetResponse = await editProjectDatasets({
      requestContext: page.request,
      id: PROJECT_ID,
      data: { remove_dataset_ids: datasetIds },
      token,
    });
    expect(resetResponse.ok()).toBeTruthy();

    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    if (!token || !datasetIds?.length) return;

    const resetResponse = await editProjectDatasets({
      requestContext: page.request,
      id: PROJECT_ID,
      data: { remove_dataset_ids: datasetIds },
      token,
    });
    expect(resetResponse.ok()).toBeTruthy();
  });

  test('Pagination', async ({ page }) => {
    await expect(page.locator('[data-testid=project-datasets-pagination]')).not.toBeVisible();

    // add one dataset to verify that the count / results-per-page options are
    // visible
    const [firstDatasetId, ...remainingDatasetIds] = datasetIds;
    const addFirstDatasetResponse = await editProjectDatasets({
      requestContext: page.request,
      id: PROJECT_ID,
      data: { add_dataset_ids: [firstDatasetId] },
      token,
    });
    expect(addFirstDatasetResponse.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination]')).toBeVisible();
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).not.toBeVisible();

    const addRemainingDatasetsResponse = await editProjectDatasets({
      requestContext: page.request,
      id: PROJECT_ID,
      data: { add_dataset_ids: remainingDatasetIds },
      token,
    });
    expect(addRemainingDatasetsResponse.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).toBeVisible();
  });
});
