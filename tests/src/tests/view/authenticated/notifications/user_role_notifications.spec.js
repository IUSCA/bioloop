const { test, expect } = require('@playwright/test');
const config = require('config');
const { randomUUID } = require('node:crypto');
const { get } = require('../../../../api');
const {
  createDirectNotification,
  createDirectNotificationForUser,
  createRoleBroadcastNotification,
  fetchUserByTicket,
  findNotificationInListPayload,
  getAdminToken,
  openDirectSseWatcher,
  openNotificationsMenu,
  parseTokenProfile,
  patchWithdraw,
  patchNotificationBookmarkState,
  visibleNotificationMenu,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.includes('user');

test.describe('Notifications', () => {
  test('user can access notifications but cannot withdraw or filter withdrawn', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const menu = page.getByTestId('notification-menu-items');
    for (let i = 0; i < 3; i += 1) {
      if (await menu.isVisible()) {
        break;
      }
      await page.getByTestId('notification-open-button').click();
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(300);
    }
    await expect(menu).toBeVisible();

    await expect(visibleNotificationMenu(page).getByTestId('filter-withdrawn')).toHaveCount(0);

    const anchors = menu.locator('.notification-anchor');
    const notificationCount = await anchors.count();

    const userToken = await page.evaluate(() => localStorage.getItem('token'));
    const userProfile = parseTokenProfile(userToken);

    if (notificationCount > 0) {
      const firstNotification = anchors.first();
      await expect(firstNotification).not.toContainText('Direct');
      await expect(firstNotification.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
      await expect(page.getByTestId('header-username')).toContainText(userProfile.username);
      return;
    }

    await expect(menu).toContainText('No pending notifications');
  });

  test('user can update own read and bookmark states', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotificationForUser({
      page,
      label: `E2E-user-own-state-${suffix}`,
      text: `body-${suffix}`,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openNotificationsMenu(page);
    const labelById = `notification-${created.id}-label`;
    await expect(page.getByTestId(labelById)).toBeVisible();

    await page.getByTestId(`notification-${created.id}-toggle-bookmark`).click();
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.getByTestId(labelById)).toBeVisible();
    await page.locator('[data-testid="active-filter-chip-bookmarked-clear"]:visible').click();

    await page.getByTestId(`notification-${created.id}-toggle-read`).click();
    await expect(page.getByTestId(labelById)).toHaveCount(0);
    await page.getByTestId('filter-read').click();
    await expect(page.getByTestId(labelById)).toBeVisible();
  });

  test('user sees direct notifications targeted only to them', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotificationForUser({
      page,
      label: `E2E-user-visible-direct-${suffix}`,
      text: `body-${suffix}`,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openNotificationsMenu(page);
    await expect(page.getByTestId(`notification-${created.id}-label`)).toBeVisible();
  });

  test('user does not see role broadcast target chips on role-targeted notifications', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const adminToken = await getAdminToken(page);
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-user-hidden-broadcast-meta-${suffix}`;
    const created = await createRoleBroadcastNotification({
      page,
      token: adminToken,
      label,
      text: `body-${suffix}`,
      roleIds: [1, 3],
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openNotificationsMenu(page);
    const createdLabel = page.locator(`[data-testid="notification-${created.id}-label"]:visible`).first();
    await expect(createdLabel).toBeVisible({ timeout: 15000 });
    const anchor = createdLabel.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');
    await expect(anchor.getByText('Role Broadcast', { exact: true })).toHaveCount(0);
  });

  test('user SSE stream connects successfully via ownership endpoint', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const userToken = await page.evaluate(() => localStorage.getItem('token'));
    const userProfile = parseTokenProfile(userToken);

    const streamPath = `/notifications/${encodeURIComponent(userProfile.username)}/stream`;
    const watcher = openDirectSseWatcher({ token: userToken, streamPath });
    try {
      const readyPayload = await watcher.readyPromise;
      expect(readyPayload).toBeTruthy();
    } finally {
      watcher.close();
    }
  });

  test('user SSE stream is denied without ownership path', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('notification-open-button')).toBeVisible();

    const userToken = await page.evaluate(() => localStorage.getItem('token'));

    const base = (
      process.env.TEST_DIRECT_API_BASE_URL
      || process.env.TEST_API_BASE_URL
      || 'http://localhost/api'
    ).replace(/\/$/, '');
    const streamUrl = `${base}/notifications/stream?token=${encodeURIComponent(userToken)}`;

    const streamStatusRes = await page.request.get(streamUrl);
    expect(streamStatusRes.status()).toBe(403);
  });

  test('user listing API omits withdrawn notifications even with bookmark filter', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    const user = await fetchUserByTicket({ page, ticket: 'user' });
    const admin = await fetchUserByTicket({ page, ticket: 'admin' });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-user-withdrawn-bookmark-api-${suffix}`;

    const created = await createDirectNotification({
      page,
      token: admin.token,
      userId: user.id,
      label,
      text: `body-${suffix}`,
    });

    const bookmarkRes = await patchNotificationBookmarkState({
      page,
      token: user.token,
      privileged: false,
      username: user.username,
      notificationId: created.id,
      isBookmarked: true,
    });
    expect(bookmarkRes.status()).toBe(200);

    const dismissRes = await patchWithdraw({
      page,
      token: admin.token,
      notificationId: created.id,
    });
    expect(dismissRes.status()).toBe(200);

    const listRes = await get({
      requestContext: page.request,
      token: user.token,
      url: `/notifications/${encodeURIComponent(user.username)}/all`,
      params: {
        bookmarked: true,
        limit: 50,
        offset: 0,
        withdrawn: true,
      },
    });
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    expect(findNotificationInListPayload(body, created.id)).toBeUndefined();
  });
});
