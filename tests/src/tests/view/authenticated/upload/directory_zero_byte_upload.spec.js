import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import { selectDirectory } from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';

const attachments = [
  { name: 'sample-dir/data.csv', content: 'a,b,c\n1,2,3\n' },
  { name: 'sample-dir/.end-of-run', content: '' },
];

test.use({ attachments });

test('directory upload succeeds with a zero-byte file', async ({
  browser,
  attachmentManager,
}) => {
  const page = await browser.newPage();
  await page.goto('/datasets/uploads/new');

  const filePaths = attachments.map(
    (file) => `${attachmentManager.getPath()}/${file.name}`,
  );
  await selectDirectory({ page, filePaths });
  await expect(page.getByTestId('upload-selected-files-table')).toBeVisible();
  await expect(page.getByTestId('file-name')).toHaveCount(2);

  await navigateToNextStep({ page });
  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-dataset-autocomplete',
    resultIndex: 0,
    verify: true,
  });
  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-project-autocomplete',
    resultIndex: 0,
    verify: true,
  });
  await selectDropdownOption({
    page,
    testId: 'upload-metadata-source-instrument-select',
    optionIndex: 0,
    verify: true,
  });

  await navigateToNextStep({ page });

  const token = await page.evaluate(() => localStorage.getItem('token'));
  const datasetName = await generateUniqueDatasetName({
    requestContext: page.request,
    token,
    type: 'DATA_PRODUCT',
  });
  await page.getByTestId('upload-details-dataset-name-input').fill(datasetName);
  await page.getByTestId('upload-next-button').click();

  await expect(page.getByTestId('chip-uploaded')).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('submission-alert')).toContainText('uploaded successfully');

  await page.close();
});
