import { test as baseTest, expect } from '@playwright/test';

import {
    selectAutocompleteResult,
    selectDropdownOption,
    typeInputValue,
} from '../../../../actions';
import { selectFiles } from '../../../../actions/datasetUpload';
import { navigateToNextStep } from '../../../../actions/stepper';
import { withAttachments } from '../../../../fixtures/withAttachments';

const attachments = [{ name: 'file_1.txt' }];

const test = withAttachments({ test: baseTest, filePath: __filename, attachments });

test.describe.serial('Dataset Upload - Name Validations (Step 3)', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/datasetUpload/new');
  });

  test('prepare: select file, fill General Info and navigate to Upload step', async ({ attachmentManager }) => {
    const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
    await selectFiles({ page, filePaths });

    await navigateToNextStep({ page });

    await selectAutocompleteResult({
      page, testId: 'upload-metadata-dataset-autocomplete', resultIndex: 0, verify: true,
    });
    await selectAutocompleteResult({
      page, testId: 'upload-metadata-project-autocomplete', resultIndex: 0, verify: true,
    });
    await selectDropdownOption({
      page, testId: 'upload-metadata-source-instrument-select', optionIndex: 0, verify: true,
    });

    await navigateToNextStep({ page });

    await expect(page.getByTestId('uploaded-dataset-details')).toBeVisible();
  });

  test('shows "cannot be empty" error by default', async () => {
    const nameRow = page.getByTestId('upload-details-dataset-name-row');
    const errorEl = nameRow.locator('.va-text-danger.text-xs.dataset-name-input');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText('Dataset name cannot be empty');
    await expect(page.getByTestId('upload-next-button')).toBeDisabled();
  });

  test('shows min length error for < 3 chars', async () => {
    await typeInputValue({
      page, testId: 'upload-details-dataset-name-input', value: 'ab', verify: true,
    });
    const nameRow = page.getByTestId('upload-details-dataset-name-row');
    const errorEl = nameRow.locator('.va-text-danger.text-xs.dataset-name-input');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText('Dataset name must have 3 or more characters.');
    await expect(page.getByTestId('upload-next-button')).toBeDisabled();
  });

  test('shows "cannot contain spaces" error', async () => {
    await typeInputValue({
      page, testId: 'upload-details-dataset-name-input', value: 'has space', verify: true,
    });
    const nameRow = page.getByTestId('upload-details-dataset-name-row');
    const errorEl = nameRow.locator('.va-text-danger.text-xs.dataset-name-input');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText('Dataset name cannot contain spaces');
    await expect(page.getByTestId('upload-next-button')).toBeDisabled();
  });

  test('valid name clears error and enables Upload button', async () => {
    await typeInputValue({
      page, testId: 'upload-details-dataset-name-input', value: 'dataset_123', verify: true,
    });
    const nameRow = page.getByTestId('upload-details-dataset-name-row');
    const errorEl = nameRow.locator('.va-text-danger.text-xs.dataset-name-input');
    await expect(errorEl).toHaveCount(0);
    await expect(page.getByTestId('upload-next-button')).toBeEnabled();
  });
});
