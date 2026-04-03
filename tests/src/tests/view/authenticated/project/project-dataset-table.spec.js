const { test, expect } = require('@playwright/test');

const { createDataset } = require('../../../../api/dataset');
const { createProject, editProjectDatasets } = require('../../../../api/project');
const { getTokenByRole } = require('../../../../fixtures/auth');

let projectId;
let adminToken;
const datasets = [];

test.describe.serial('Project-datasets table', () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(120000);
    adminToken = await getTokenByRole({ role: 'admin' });
    const project = await createProject({
      requestContext: request,
      token: adminToken,
    });
    projectId = project.id;

    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const dataset = await createDataset({
        requestContext: request,
        token: adminToken,
        data: { type: 'RAW_DATA' },
      });
      datasets.push(dataset);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
  });

  test('Pagination', async ({ page }) => {
    // Playwright API context for making network requests
    const apiRequestContext = page.request;

    // remove all datasets from the project
    await editProjectDatasets({
      requestContext: apiRequestContext,
      id: projectId,
      data: {
        remove_dataset_ids: datasets.map((dataset) => dataset.id),
      },
      token: adminToken,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination]')).not.toBeVisible();

    // add one dataset to verify that the count / results-per-page options are
    // visible
    await editProjectDatasets({
      requestContext: apiRequestContext,
      id: projectId,
      data: {
        add_dataset_ids: [datasets[0].id],
      },
      token: adminToken,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-table] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).toHaveCount(0);

    // add enough datasets to require pagination controls
    await editProjectDatasets({
      requestContext: apiRequestContext,
      id: projectId,
      data: {
        add_dataset_ids: datasets.slice(1).map((dataset) => dataset.id),
      },
      token: adminToken,
    });
    await page.reload();
    await expect(page.locator('[data-testid=project-datasets-pagination] .va-pagination')).toBeVisible({ timeout: 15000 });
  });
});
