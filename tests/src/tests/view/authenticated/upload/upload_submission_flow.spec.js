import { test as baseTest, expect } from '@playwright/test';

import {
  selectAutocompleteResult,
  selectDropdownOption,
  typeInputValue,
} from '../../../../actions';
import {
  selectFiles,
} from '../../../../actions/datasetUpload';
import {
  navigateToNextStep,
} from '../../../../actions/stepper';
import { withAttachments } from '../../../../fixtures/withAttachments';

const attachments = Array.from({ length: 2 }, (_, i) => ({ name: `file_${i + 1}.txt` }));

// Set up attachments for this test and a temporary directory to store these
// attachments in
const test = withAttachments({ test: baseTest, filePath: __filename, attachments });

test.describe.serial('Dataset Upload - Submission Flow (Step 3)', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasetUpload/new');
  });

  test('prepare: select files and fill General Info, then navigate to Upload step', async ({ attachmentManager }) => {
    // Select files
    const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
    await selectFiles({ page, filePaths });

    // Next to General Info
    await navigateToNextStep({ page });

    // Fill General Info
    await selectAutocompleteResult({
      page, testId: 'upload-metadata-dataset-autocomplete', resultIndex: 0, verify: true,
    });
    await selectAutocompleteResult({
      page, testId: 'upload-metadata-project-autocomplete', resultIndex: 0, verify: true,
    });
    await selectDropdownOption({
      page, testId: 'upload-metadata-source-instrument-select', optionIndex: 0, verify: true,
    });

    // Next to Upload step
    await navigateToNextStep({ page });

    // Verify we are on Upload step: details card and table visible
    await expect(page.getByTestId('uploaded-dataset-details')).toBeVisible();
    await expect(page.getByTestId('dataset-upload-table')).toBeVisible();
  });

  test('shows dataset name error state by default and disables Upload until valid', async () => {
    // Error message should be visible for empty dataset name
    const nameRow = page.getByTestId('upload-details-dataset-name-row');
    const errorEl = nameRow.locator('.va-text-danger.text-xs.dataset-name-input');
    await expect(errorEl).toBeVisible();

    // Upload button should be disabled while there are validation errors
    await expect(page.getByTestId('upload-next-button')).toBeDisabled();
  });

  test('typing valid dataset name enables Upload button', async () => {
    await typeInputValue({
      page, testId: 'upload-details-dataset-name-input', value: 'my_new_dataset', verify: true,
    });

    // Upload button should now be enabled
    await expect(page.getByTestId('upload-next-button')).toBeEnabled();
  });

  test('clicking Upload triggers processing then uploading, then uploaded status and success alert', async () => {
    // Click Upload
    await page.getByTestId('upload-next-button').click();

    // Status transitions: expect final Uploaded state
    await expect(page.getByTestId('upload-status-icon')).toBeVisible();
    await expect(page.getByTestId('status-uploaded')).toBeVisible();

    // Success alert appears
    const alert = page.getByTestId('submission-alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('All files have been uploaded successfully');

    // Upload button should now be disabled after success
    await expect(page.getByTestId('upload-next-button')).toBeDisabled();
  });
});
