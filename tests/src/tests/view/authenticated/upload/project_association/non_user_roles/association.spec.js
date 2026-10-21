import { expect, test } from '../../../../../../fixtures';
import submitProjectAssociationUpload from '../helpers';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let uploadedDatasetName;

  test.beforeAll(async ({ browser, attachmentManager }) => {
    page = await browser.newPage();

    const filePaths = attachments.map(
      (file) => `${attachmentManager.getPath()}/${file.name}`,
    );
    ({ uploadedDatasetName } = await submitProjectAssociationUpload({
      page,
      filePaths,
      associateProject: true,
    }));
  });

  test.describe('Upload-initiation step', () => {
    test('should associate the uploaded Dataset with the selected Project', async () => {
      // Verify that the uploaded Dataset is associated with the selected
      // Project
      // - Visit the Project page
      const projectLink = page.getByTestId('upload-details-project-link');
      await expect(projectLink).toBeVisible();
      await expect(projectLink).not.toHaveText('');

      const projectHref = await projectLink.getAttribute('href');
      expect(projectHref).toBeTruthy();

      // Navigate to the selected Project's page
      // - Create a new Page  instance for the Project view, since the Project
      // view opens in a new tab
      const [projectPage] = await Promise.all([
        page.context().waitForEvent('page'),
        projectLink.click(),
      ]);

      // Wait for the Project page to load
      await projectPage.waitForLoadState('domcontentloaded');
      await projectPage.waitForURL((url) => {
        try {
          return new URL(url).pathname === projectHref;
        } catch (error) {
          return false;
        }
      });

      // Verify that the uploaded Dataset is listed in the Project's datasets
      // table
      const projectDatasetsTable = projectPage.getByTestId('project-datasets-table');
      await expect(projectDatasetsTable).toBeVisible();
      const datasetRow = projectDatasetsTable.locator('tbody tr').filter({ hasText: uploadedDatasetName });
      await expect(datasetRow.first()).toBeVisible();

      await projectPage.close();
    });
  });
});
