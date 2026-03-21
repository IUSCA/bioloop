const { test, expect } = require('@playwright/test');

const PROJECT_ID = '98045a35-723c-4e1b-88e6-9462c1aff4c1';

test.describe('Project navigation and page shell', () => {
  test('projects index can navigate to create-project flow', async ({ page }) => {
    await page.goto('/projects');

    await expect(
      page.getByRole('button', { name: 'Create Project' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);

    await expect(page.getByText('General Info', { exact: true })).toBeVisible();
  });

  test('project details renders key sections and merge modal', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);

    await expect(page.getByText('General Info', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Associated Datasets', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Maintenance Actions', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('project-datasets-table')).toBeVisible();

    await page.getByTestId('merge-projects-button').click();
    await expect(page.getByTestId('merge-projects-modal')).toBeVisible();
  });

  test('project datasets table links to nested dataset route', async ({ page }) => {
    await page.goto(`/projects/${PROJECT_ID}`);

    const datasetLinks = page.locator('[data-testid=project-datasets-table] a.va-link');
    const datasetLinkCount = await datasetLinks.count();
    test.skip(
      datasetLinkCount === 0,
      'No associated datasets found for seeded project; cannot validate nested route link.',
    );

    await datasetLinks.first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/datasets\/[^/]+$/);
    await expect(page.getByText('Info', { exact: true })).toBeVisible();
  });
});
