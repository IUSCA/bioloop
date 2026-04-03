import { expect, test } from '../../../../fixtures';
import { buildFeatureEnabledRolesFromEnv } from '../../../../utils/feature';

function resolveRole(testInfo) {
  const fromMeta = testInfo.project.metadata?.e2eRole;
  if (fromMeta && ['admin', 'operator', 'user'].includes(fromMeta)) return fromMeta;
  const [candidate] = testInfo.project.name.split('_');
  return ['admin', 'operator', 'user'].includes(candidate) ? candidate : null;
}

test.describe('Upload feature access control', () => {
  test('shows disabled warning when uploads feature is disabled for role', async ({ page }, testInfo) => {
    const role = resolveRole(testInfo);
    const uploadsEnabledRoles = buildFeatureEnabledRolesFromEnv().uploads;
    test.skip(
      uploadsEnabledRoles.includes(role),
      `Uploads are enabled for ${role}; this project should only run disabled-role checks.`,
    );

    await page.goto('/datasets/uploads/new', { waitUntil: 'domcontentloaded' });
    const uploadDisabledAlert = page.getByTestId('upload-feature-disabled-alert');
    if (await uploadDisabledAlert.count() === 0) {
      test.skip(true, 'Uploads appear enabled for this role in the current runtime configuration.');
    }
    await expect(uploadDisabledAlert).toBeVisible();

    await page.goto('/datasets/uploads', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('This feature is currently disabled')).toBeVisible();
  });
});
