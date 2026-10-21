/**
 * Verifies that each role sees either the Upload UI or the disabled-feature
 * warning according to the current instance's UPLOAD_ENABLED_ROLES setting.
 */
import { expect, test } from '@playwright/test';

import { getUploadEnabledRoles } from '../../../../config/featureRoles';

const PROJECT_PREFIX = 'upload_access_';
const uploadEnabledForRoles = getUploadEnabledRoles();

function getExpectedAccess(testInfo) {
  const role = testInfo.project.name.replace(PROJECT_PREFIX, '');
  return uploadEnabledForRoles.includes(role);
}

async function expectAccessState({ page, shouldHaveAccess, enabledTestId }) {
  if (shouldHaveAccess) {
    await expect(page.getByTestId(enabledTestId)).toBeVisible();
    await expect(page.getByTestId('upload-feature-disabled-alert')).toHaveCount(0);
    return;
  }

  await expect(page.getByTestId('upload-feature-disabled-alert')).toBeVisible();
  await expect(page.getByTestId(enabledTestId)).toHaveCount(0);
}

test('shows the expected Upload creation access', async ({ page }, testInfo) => {
  const shouldHaveAccess = getExpectedAccess(testInfo);

  await page.goto('/datasets/uploads/new');
  await expectAccessState({
    page,
    shouldHaveAccess,
    enabledTestId: 'upload-container',
  });
});

test('shows the expected Upload history access', async ({ page }, testInfo) => {
  const shouldHaveAccess = getExpectedAccess(testInfo);

  await page.goto('/datasets/uploads');
  await expectAccessState({
    page,
    shouldHaveAccess,
    enabledTestId: 'uploads-history-table',
  });
});
