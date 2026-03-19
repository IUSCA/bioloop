import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  selectFiles,
  setUploadFailureSimulation,
} from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';

const attachments = [
  {
    name: 'resume_target.bin',
    content: 'a'.repeat(2 * 1024 * 1024),
  },
];

test.use({ attachments });

test('upload resumes after simulated mid-upload failure', async ({
  browser,
  attachmentManager,
}) => {
  const page = await browser.newPage();
  await page.goto('/datasets/uploads/new');

  await setUploadFailureSimulation({
    page,
    mode: 'mid-upload',
    count: 1,
  });

  const filePath = `${attachmentManager.getPath()}/${attachments[0].name}`;
  await selectFiles({ page, filePaths: [filePath] });
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

  await setUploadFailureSimulation({ page });
  await page.close();
});
