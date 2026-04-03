const { test, expect } = require('@playwright/test');
const { buildFeatureEnabledRolesFromEnv } = require('../../../../utils/feature');

function resolveRole(testInfo) {
  const fromMeta = testInfo.project.metadata?.e2eRole;
  if (fromMeta && ['admin', 'operator', 'user'].includes(fromMeta)) return fromMeta;
  const [candidate] = testInfo.project.name.split('_');
  return ['admin', 'operator', 'user'].includes(candidate) ? candidate : null;
}

test.describe('Notifications access control', () => {
  test('notification bell is hidden when feature is disabled for role', async ({ page }, testInfo) => {
    const role = resolveRole(testInfo);
    const notificationsEnabledRoles = buildFeatureEnabledRolesFromEnv().notifications;
    test.skip(
      notificationsEnabledRoles.includes(role),
      `Notifications are enabled for ${role}; this project should only run disabled-role checks.`,
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toHaveCount(0);
    await expect(page.getByTestId('notification-count')).toHaveCount(0);
  });
});
