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
  ensureNotificationOpenButtonVisible,
  openNotificationsMenu,
  parseTokenProfile,
  patchNotificationBookmarkState,
  visibleNotificationMenu,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.includes('user');

test.describe('Notifications', () => {
  test.describe.configure({ timeout: 180000 });

  test('user can access notifications menu', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await expect(menu).toBeAttached({ timeout: 15000 });
    await waitForNotificationMenuListIdle(page);

    const anchors = menu.locator('.notification-anchor');
    const notificationCount = await anchors.count();

    const userToken = await page.evaluate(() => localStorage.getItem('token'));
    const userProfile = parseTokenProfile(userToken);

    if (notificationCount > 0) {
      const firstNotification = anchors.first();
      await expect(firstNotification).not.toContainText('Direct');
      await expect(page.getByTestId('header-username')).toContainText(userProfile.username);
      return;
    }

    const emptyState = menu.getByTestId('notification-empty-state');
    await expect(emptyState).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => (await emptyState.innerText()).trim(), { timeout: 25000 })
      .toBe('No pending notifications');
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
    const menuPanel = visibleNotificationMenu(page);
    const createdLabel = menuPanel.getByTestId(`notification-${created.id}-label`);
    await expect(createdLabel).toBeAttached({ timeout: 20000 });
    await createdLabel.scrollIntoViewIfNeeded();
    await expect(createdLabel).toBeVisible({ timeout: 20000 });
    const anchor = createdLabel.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');
    await expect(anchor.getByText('Role Broadcast', { exact: true })).toHaveCount(0);
  });

  test('user listing API returns bookmarked notifications', async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled for user role');

    const user = await fetchUserByTicket({ page, ticket: 'user' });
    const admin = await fetchUserByTicket({ page, ticket: 'admin' });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-user-bookmark-api-${suffix}`;

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

    const listRes = await get({
      requestContext: page.request,
      token: user.token,
      url: `/notifications/${encodeURIComponent(user.username)}/all`,
      params: {
        bookmarked: true,
        limit: 50,
        offset: 0,
      },
    });
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    expect(findNotificationInListPayload(body, created.id)).toBeDefined();
  });
});
