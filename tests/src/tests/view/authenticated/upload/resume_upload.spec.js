import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
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

function trackTusRecoveryRequests(page) {
  const requests = {
    failedPatchResponses: 0,
    resumeHeadRequests: 0,
  };
  const isTusFileRequest = (url) => /\/uploads\/files\/[^/]+$/.test(url);

  page.on('response', (response) => {
    const request = response.request();

    if (
      request.method() === 'PATCH'
      && isTusFileRequest(request.url())
      && response.status() >= 500
    ) {
      requests.failedPatchResponses += 1;
    }
  });

  page.on('request', (request) => {
    if (
      request.method() === 'HEAD'
      && isTusFileRequest(request.url())
    ) {
      requests.resumeHeadRequests += 1;
    }
  });

  return requests;
}

test('upload resumes after simulated mid-upload failure', async ({
  browser,
  attachmentManager,
}) => {
  const page = await browser.newPage();
  const recoveryRequests = trackTusRecoveryRequests(page);

  try {
    await openNewUpload({ page });
    await setUploadFailureSimulation({
      page,
      mode: 'mid-upload',
      count: 1,
    });

    const filePath = `${attachmentManager.getPath()}/${attachments[0].name}`;
    await selectFilesAndGoToGeneralInfo({
      page,
      filePaths: [filePath],
    });

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
    await page.getByTestId('upload-next-button').click();

    await expect(page.getByTestId('chip-uploaded')).toBeVisible({
      timeout: 120000,
    });
    await expect(page.getByTestId('submission-alert')).toContainText(
      'uploaded successfully',
    );
    expect(recoveryRequests.failedPatchResponses).toBeGreaterThan(0);
    expect(recoveryRequests.resumeHeadRequests).toBeGreaterThan(0);
  } finally {
    if (!page.isClosed()) {
      await setUploadFailureSimulation({ page });
      await page.close();
    }
  }
});
