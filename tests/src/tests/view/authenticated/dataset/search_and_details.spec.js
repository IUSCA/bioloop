import { randomUUID } from 'crypto';
import { createDataset } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';
import { getTokenByRole } from '../../../../fixtures/auth';

test.describe.serial('Dataset search and details view', () => {
  // test.describe.configure({ timeout: 120000 });
  let dataset;
  let adminToken;

  test.beforeAll(async ({ request }, testInfo) => {
    // testInfo.setTimeout(120000);
    adminToken = await getTokenByRole({ role: 'admin' });
    const uniqueName = `e2e-dataset-search-${randomUUID()}`;

    dataset = await createDataset({
      requestContext: request,
      token: adminToken,
      data: {
        name: uniqueName,
        type: 'RAW_DATA',
        origin_path: `/tmp/${uniqueName}`,
      },
    });
    expect(dataset?.id).toBeTruthy();
  });

  test('search finds the created dataset in Raw Data list', async ({ page }) => {
    await page.goto('/rawdata', { waitUntil: 'domcontentloaded' });
    const searchInput = page.getByPlaceholder(/Search raw data/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill(dataset.name);

    const datasetLink = page.getByRole('link', { name: dataset.name }).first();
    await expect(datasetLink).toBeVisible(
      // { timeout: 15000 }
    );
  });

  test('dataset details page loads and shows workflow section', async ({ page }) => {
    await page.goto('/rawdata', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/Search raw data/i).fill(dataset.name);

    const datasetLink = page.locator(`a[href="/datasets/${dataset.id}"]`).first();
    await expect(datasetLink).toBeVisible(
      // { timeout: 15000 }
    );
    await datasetLink.click();
    await expect(page.getByTestId('dataset-workflows-section')).toBeVisible();
  });
});
