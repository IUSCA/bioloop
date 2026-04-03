const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { buildFeatureEnabledRolesFromEnv } = require('../../../../utils/feature');
const {
  createDirectNotification,
  createRoleBroadcastNotification,
  currentRole,
  ensureNotificationOpenButtonVisible,
  fetchCurrentUser,
  fetchUserByTicket,
  labelById,
  openNotificationsMenu,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const notificationEnabledRoles = buildFeatureEnabledRolesFromEnv().notifications;

test.describe('Notifications - admin/operator role behavior', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('admin/operator can open notifications menu', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const featureEnabled = notificationEnabledRoles.includes(role);
    test.skip(!featureEnabled, `Notifications feature is not enabled for ${role}`);

    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
  });

  test('direct notification to user stays invisible to admin/operator', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const featureEnabled = notificationEnabledRoles.includes(role);
    test.skip(!featureEnabled, `Notifications feature is not enabled for ${role}`);

    const { token } = await fetchCurrentUser({ page, role });
    const targetUser = await fetchUserByTicket({ page, ticket: 'user' });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-direct-user-only-${role}-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId: Number(targetUser.id),
      label,
      text: `Body for ${label}`,
    });

    await openNotificationsMenu(page);
    await waitForNotificationMenuListIdle(page);
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
  });

  test('admin/operator can see role-broadcast delivery chip', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const featureEnabled = notificationEnabledRoles.includes(role);
    test.skip(!featureEnabled, `Notifications feature is not enabled for ${role}`);

    const { token } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const created = await createRoleBroadcastNotification({
      page,
      token,
      roleIds: [1, 2, 3],
      label: `E2E-broadcast-chip-${role}-${suffix}`,
      text: `Body for ${suffix}`,
    });

    await openNotificationsMenu(page);
    await waitForNotificationMenuListIdle(page);
    const rowAnchor = page
      .getByTestId(labelById(created.id))
      .locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');

    await expect(page.getByTestId(labelById(created.id))).toBeVisible();
    await expect(rowAnchor).toContainText('Role Broadcast');
  });
});
