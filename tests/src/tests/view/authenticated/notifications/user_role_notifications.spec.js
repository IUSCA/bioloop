const { test, expect } = require('@playwright/test');
const config = require('config');
const { randomUUID } = require('node:crypto');
const {
  createDirectNotificationForUser,
  openDirectSseWatcher,
  openNotificationsMenu,
  parseTokenProfile,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.includes('user');

test.describe('Notifications', () => {
  test('user can access notifications but cannot globally dismiss', async ({ page }) => {
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

    const anchors = menu.locator('.notification-anchor');
    const notificationCount = await anchors.count();

    const userToken = await page.evaluate(() => localStorage.getItem('token'));
    const userProfile = parseTokenProfile(userToken);

    if (notificationCount > 0) {
      const firstNotification = anchors.first();
      await expect(firstNotification).toContainText(/Direct|Role Broadcast/);
      await expect(firstNotification.getByRole('button', { name: 'Dismiss globally' })).toHaveCount(0);
      await expect(page.getByTestId('header-username')).toContainText(userProfile.username);
      return;
    }

    await expect(menu).toContainText(/No pending notifications|No globally dismissed notifications/);
  });

  test('user can update own read/bookmark/archive states', async ({ page }) => {
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

    await page.getByTestId(`notification-${created.id}-toggle-archive`).click();
    await expect(page.getByTestId(labelById)).toHaveCount(0);
    await page.getByTestId('filter-archived').click();
    await expect(page.getByTestId(labelById)).toBeVisible();

    await page.getByTestId(`notification-${created.id}-toggle-archive`).click();
    await page.locator('[data-testid="active-filter-chip-archived-clear"]:visible').click();
    await expect(page.getByTestId(labelById)).toBeVisible();
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

    const baseUrl = process.env.TEST_DIRECT_API_BASE_URL || process.env.TEST_API_BASE_URL || 'http://localhost';
    const streamUrl = new URL(
      `/notifications/stream?token=${encodeURIComponent(userToken)}`,
      baseUrl,
    );

    const streamStatusRes = await page.request.get(streamUrl.toString());
    expect(streamStatusRes.status()).toBe(403);
  });
});
