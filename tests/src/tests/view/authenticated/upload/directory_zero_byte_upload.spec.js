import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  openNewUpload,
  selectDirectory,
} from '../../../../actions/datasetUpload';
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
  await openNewUpload({ page });

  const directoryPath = `${attachmentManager.getPath()}/sample-dir`;
  await selectDirectory({ page, directoryPath });

  const selectedFilesTable = page.getByTestId('upload-selected-files-table');
  await expect(selectedFilesTable).toBeVisible({ timeout: 15000 });
  await expect(selectedFilesTable.getByTestId('folder-icon')).toBeVisible();
  await expect(selectedFilesTable.getByTestId('file-name')).toHaveText(
    'sample-dir',
  );

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });
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

  await navigateToNextStep({ page, nextButtonTestId: 'upload-next-button' });

  const token = await page.evaluate(
    () => globalThis.localStorage.getItem('token'),
  );
  const datasetName = await generateUniqueDatasetName({
    requestContext: page.request,
    token,
    type: 'DATA_PRODUCT',
  });
  await page.getByTestId('upload-details-dataset-name-input').fill(datasetName);

  const completionRequestPromise = page.waitForRequest(
    (request) => request.method() === 'POST'
      && /\/datasets\/uploads\/\d+\/complete(?:\?|$)/.test(request.url()),
    { timeout: 120000 },
  );
  await page.getByTestId('upload-next-button').click();

  const completionRequest = await completionRequestPromise;
  const sizeManifest = completionRequest.postDataJSON().metadata.size_manifest;
  expect(sizeManifest.file_count).toBe(2);
  expect(sizeManifest.files).toEqual(expect.arrayContaining([
    { path: 'data.csv', size: 12 },
    { path: '.end-of-run', size: 0 },
  ]));

  await expect(page.getByTestId('chip-uploaded')).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('submission-alert')).toContainText('uploaded successfully');

  await page.close();
});
