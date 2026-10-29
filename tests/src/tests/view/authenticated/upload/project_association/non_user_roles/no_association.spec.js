import { getDatasets } from '../../../../../../api/dataset';
import { expect, test } from '../../../../../../fixtures';
import { getTokenByRole } from '../../../../../../fixtures/auth';
import submitProjectAssociationUpload from '../helpers';

const attachments = Array.from({ length: 3 }, (_, i) => ({ name: `file_${i + 1}` }));

test.use({ attachments });

test.describe.serial('Dataset Upload Process', () => {
  let page; // Playwright page instance

  let selectedDatasetType;
  let uploadedDatasetName;

  test.beforeAll(async ({ browser, attachmentManager }) => {
    page = await browser.newPage();

    const filePaths = attachments.map(
      (file) => `${attachmentManager.getPath()}/${file.name}`,
    );
    const uploadResult = await submitProjectAssociationUpload({
      page,
      filePaths,
      associateProject: false,
    });
    selectedDatasetType = uploadResult.selectedDatasetType;
    uploadedDatasetName = uploadResult.uploadedDatasetName;
  });

  test.describe('Upload-initiation step', () => {
    test('should not associate the uploaded Dataset with any Project', async () => {
      // Get token for admin role which will be used to call the datasets API
      const adminToken = await getTokenByRole({ role: 'admin' });
      let matchingDataset = null;

      await expect(async () => {
        const response = await getDatasets({
          token: adminToken,
          params: {
            name: uploadedDatasetName,
            type: selectedDatasetType.split(' ').join('_').toUpperCase(),
            include_projects: true,
          },
        });
        const body = await response.json();
        expect(body?.datasets?.length || 0).toBe(1);
        [matchingDataset] = body.datasets;
      }).toPass();

      expect(matchingDataset.projects).toHaveLength(0);
    });
  });
});
