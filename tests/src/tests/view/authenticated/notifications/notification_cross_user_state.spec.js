const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const config = require('config');
const { get } = require('../../../../api');
const {
  createDirectNotification,
  createRoleBroadcastNotification,
  ensureNotificationsMenuOpen,
  ensureNotificationOpenButtonVisible,
  fetchDefaultUnreadNotifications,
  findNotificationInListPayload,
  labelById,
  loadStandardViewerProfiles,
  loginAsTicket,
  openNotificationsMenu,
  patchMarkAllRead,
  patchNotificationBookmarkState,
  patchNotificationReadState,
  refreshNotificationView,
  toggleReadById,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

/** Prisma role ids: admin=1, operator=2, user=3 (E2E seed). */
const ROLE_IDS_ALL = [1, 2, 3];

async function createBroadcastToAllRoles(page, adminToken, suffix) {
  const label = `E2E-cross-broadcast-${suffix}`;
  return createRoleBroadcastNotification({
    page,
    token: adminToken,
    label,
    text: `body-${suffix}`,
    roleIds: ROLE_IDS_ALL,
  });
}

async function createDirectToAllViewers(page, adminToken, profiles, suffix) {
  const label = `E2E-cross-direct-${suffix}`;
  return createDirectNotification({
    page,
    token: adminToken,
    userIds: [profiles.admin.userId, profiles.operator.userId, profiles.user.userId],
    label,
    text: `body-${suffix}`,
  });
}

async function fetchRecentNotifications(page, viewer) {
  const params = {
    limit: 100,
    offset: 0,
  };
  if (viewer.privileged) {
    return get({
      requestContext: page.request,
      token: viewer.token,
      url: '/notifications',
      params,
    });
  }
  return get({
    requestContext: page.request,
    token: viewer.token,
    url: `/notifications/${encodeURIComponent(viewer.username)}/all`,
    params,
  });
}

test.describe('Notification cross-user state (API)', () => {
  test.skip(!featureEnabled, 'Notifications feature is not enabled');

  test('role broadcast: other viewers stay unread when one marks read', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin_notifications',
      'Runs once under admin_notifications',
    );
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createBroadcastToAllRoles(page, profiles.admin.token, suffix);
    const viewers = [profiles.admin, profiles.operator, profiles.user];

    for (const actor of viewers) {
      const patchRes = await patchNotificationReadState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isRead: true,
      });
      expect(patchRes.status(), `actor ${actor.key} mark read`).toBe(200);

      for (const observer of viewers) {
        if (observer.key === actor.key) continue;
        const listRes = await fetchDefaultUnreadNotifications({
          page,
          token: observer.token,
          privileged: observer.privileged,
          username: observer.username,
        });
        expect(listRes.status()).toBe(200);
        const body = await listRes.json();
        const row = findNotificationInListPayload(body, created.id);
        expect(row, `observer ${observer.key} after ${actor.key} read`).toBeTruthy();
        expect(row.state.is_read).toBe(false);
      }

      const resetRes = await patchNotificationReadState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isRead: false,
      });
      expect(resetRes.status()).toBe(200);
    }
  });

  test('direct multi-recipient: other viewers stay unread when one marks read', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin_notifications',
      'Runs once under admin_notifications',
    );
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectToAllViewers(page, profiles.admin.token, profiles, suffix);
    const viewers = [profiles.admin, profiles.operator, profiles.user];

    for (const actor of viewers) {
      const patchRes = await patchNotificationReadState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isRead: true,
      });
      expect(patchRes.status(), `actor ${actor.key} mark read`).toBe(200);

      for (const observer of viewers) {
        if (observer.key === actor.key) continue;
        const listRes = await fetchDefaultUnreadNotifications({
          page,
          token: observer.token,
          privileged: observer.privileged,
          username: observer.username,
        });
        expect(listRes.status()).toBe(200);
        const body = await listRes.json();
        const row = findNotificationInListPayload(body, created.id);
        expect(row, `observer ${observer.key} after ${actor.key} read`).toBeTruthy();
        expect(row.state.is_read).toBe(false);
      }

      const resetRes = await patchNotificationReadState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isRead: false,
      });
      expect(resetRes.status()).toBe(200);
    }
  });

  test('role broadcast: other viewers stay not bookmarked when one bookmarks', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin_notifications',
      'Runs once under admin_notifications',
    );
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createBroadcastToAllRoles(page, profiles.admin.token, suffix);
    const viewers = [profiles.admin, profiles.operator, profiles.user];

    for (const actor of viewers) {
      const patchRes = await patchNotificationBookmarkState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isBookmarked: true,
      });
      expect(patchRes.status(), `actor ${actor.key} bookmark`).toBe(200);

      for (const observer of viewers) {
        if (observer.key === actor.key) continue;
        const listRes = await fetchRecentNotifications(page, observer);
        expect(listRes.status()).toBe(200);
        const body = await listRes.json();
        const row = findNotificationInListPayload(body, created.id);
        expect(row, `observer ${observer.key} after ${actor.key} bookmark`).toBeTruthy();
        expect(row.state.is_bookmarked).toBe(false);
      }

      const resetRes = await patchNotificationBookmarkState({
        page,
        token: actor.token,
        privileged: actor.privileged,
        username: actor.username,
        notificationId: created.id,
        isBookmarked: false,
      });
      expect(resetRes.status()).toBe(200);
    }
  });

  test('mark-all-read only affects the acting user', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'admin_notifications',
      'Runs once under admin_notifications',
    );
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createBroadcastToAllRoles(page, profiles.admin.token, suffix);

    const markRes = await patchMarkAllRead({
      page,
      token: profiles.operator.token,
      privileged: profiles.operator.privileged,
      username: profiles.operator.username,
    });
    expect(markRes.status()).toBe(200);

    const opUnread = await fetchDefaultUnreadNotifications({
      page,
      token: profiles.operator.token,
      privileged: profiles.operator.privileged,
      username: profiles.operator.username,
    });
    expect(opUnread.status()).toBe(200);
    expect(findNotificationInListPayload(await opUnread.json(), created.id)).toBeUndefined();

    for (const observer of [profiles.admin, profiles.user]) {
      const listRes = await fetchDefaultUnreadNotifications({
        page,
        token: observer.token,
        privileged: observer.privileged,
        username: observer.username,
      });
      expect(listRes.status()).toBe(200);
      const body = await listRes.json();
      const row = findNotificationInListPayload(body, created.id);
      expect(row, `still unread for ${observer.key}`).toBeTruthy();
      expect(row.state.is_read).toBe(false);
    }
  });

});

test.describe('Notification cross-user state (UI)', () => {
  test.describe.configure({ timeout: 180000 });
  test.skip(!featureEnabled, 'Notifications feature is not enabled');

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
  });

  test('after admin marks broadcast read, operator still sees it as unread', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'admin_notifications');
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createBroadcastToAllRoles(page, profiles.admin.token, suffix);
    await refreshNotificationView(page);
    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
    await loginAsTicket({
      page,
      ticket: 'operator',
      expectedUsername: config.e2e.users.operator.username,
    });
    await ensureNotificationOpenButtonVisible(page);
    const menu = await ensureNotificationsMenuOpen(page);
    await waitForNotificationMenuListIdle(page);
    const lbl = menu.getByTestId(labelById(created.id));
    await expect(lbl).toBeAttached({ timeout: 20000 });
    await lbl.scrollIntoViewIfNeeded();
    await expect(lbl).toBeVisible({ timeout: 20000 });
    await expect(menu.getByTestId(toggleReadById(created.id))).toContainText('Mark read');
  });

  test('after operator marks broadcast read, user still sees it as unread', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'operator_notifications');
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createBroadcastToAllRoles(page, profiles.admin.token, suffix);
    await refreshNotificationView(page);
    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
    await loginAsTicket({
      page,
      ticket: 'user',
      expectedUsername: config.e2e.users.user.username,
    });
    await ensureNotificationOpenButtonVisible(page);
    const menu = await ensureNotificationsMenuOpen(page);
    await waitForNotificationMenuListIdle(page);
    const lbl = menu.getByTestId(labelById(created.id));
    await expect(lbl).toBeAttached({ timeout: 20000 });
    await lbl.scrollIntoViewIfNeeded();
    await expect(lbl).toBeVisible({ timeout: 20000 });
    await expect(menu.getByTestId(toggleReadById(created.id))).toContainText('Mark read');
  });

  test('after user marks direct notification read, admin still sees it as unread', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'user_notifications');
    const profiles = await loadStandardViewerProfiles(page);
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectToAllViewers(page, profiles.admin.token, profiles, suffix);
    await refreshNotificationView(page);
    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
    await loginAsTicket({
      page,
      ticket: 'admin',
      expectedUsername: config.e2e.users.admin.username,
    });
    await ensureNotificationOpenButtonVisible(page);
    const menu = await ensureNotificationsMenuOpen(page);
    await waitForNotificationMenuListIdle(page);
    const lbl = menu.getByTestId(labelById(created.id));
    await expect(lbl).toBeAttached({ timeout: 20000 });
    await lbl.scrollIntoViewIfNeeded();
    await expect(lbl).toBeVisible({ timeout: 20000 });
    await expect(menu.getByTestId(toggleReadById(created.id))).toContainText('Mark read');
  });
});
