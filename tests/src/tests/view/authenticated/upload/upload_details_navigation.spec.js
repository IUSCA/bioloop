import {
  selectAutocompleteResult,
  selectDropdownOption,
} from '../../../../actions';
import {
  openNewUpload,
  selectFilesAndGoToGeneralInfo,
} from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { generateUniqueDatasetName } from '../../../../api/dataset';
import { expect, test } from '../../../../fixtures';

const attachments = [
  { name: 'tiny-upload.txt', content: 'tiny upload payload' },
];

test.use({ attachments });

test('uploads list navigates to the new upload page', async ({ page }) => {
  await page.goto('/datasets/uploads');

  await Promise.all([
    page.waitForURL('**/datasets/uploads/new'),
    page.getByRole('button', { name: 'Upload Dataset' }).click(),
  ]);

  await expect(page).toHaveURL('/datasets/uploads/new');
  await expect(page.getByTestId('upload-dataset-stepper')).toBeVisible();
});

test('finished upload navigates to details page with correct info', async ({
  page,
  attachmentManager,
}) => {
  await openNewUpload({ page });

  const filePaths = [
    `${attachmentManager.getPath()}/${attachments[0].name}`,
  ];
  await selectFilesAndGoToGeneralInfo({ page, filePaths });

  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-dataset-autocomplete',
    verify: true,
  });
  await selectAutocompleteResult({
    page,
    testId: 'upload-metadata-project-autocomplete',
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

  // Wait for upload completion state
  const uploadedChip = page.getByTestId('chip-uploaded');
  const failedChip = page.getByTestId('chip-upload-failed');
  await expect(uploadedChip.or(failedChip)).toBeVisible();
  if (await failedChip.isVisible()) {
    const failureMessage = await page.getByTestId('submission-alert').innerText();
    throw new Error(`Upload failed before details navigation: ${failureMessage}`);
  }
  await expect(page.getByTestId('submission-alert')).toContainText('uploaded successfully');

  // Navigate to uploads list and click details link
  await page.goto('/datasets/uploads');
  await expect(page.getByTestId('uploads-history-table')).toBeVisible();

  const detailsLink = page.getByTestId('upload-details-link').first();
  await expect(detailsLink).toBeVisible({ timeout: 20000 });
  await detailsLink.click();

  // Verify navigated to details page
  await expect(page).toHaveURL(/\/datasets\/uploads\/\d+$/);

  // Verify overview card renders with expected data
  await expect(page.getByTestId('upload-overview-card')).toBeVisible();
  await expect(page.getByTestId('upload-overview-dataset-link')).toContainText(datasetName);
  await expect(page.getByTestId('upload-overview-status-chip')).toBeVisible();
});
