/* cspell:ignore unroute */
const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');

const { createNotification, deleteNotifications } = require('../../../../api/notification');

// These tests will be skipped if notifications feature is not enabled.

const NUMBER_OF_NOTIFICATIONS = 2;
const NOTIFICATION_LABELS = _.range(NUMBER_OF_NOTIFICATIONS)
  .map((e, i) => `Notification Label ${i + 1}`);
const NOTIFICATION_TEXTS = _.range(NUMBER_OF_NOTIFICATIONS)
  .map((e, i) => `Notification Text ${i + 1}`);

const notificationBadgeLocator = (page) => page.getByTestId('notification-count')
  .locator('span.va-badge__text');

const notificationMenuItemLocator = (page) => page.getByTestId('notification-menu-items')
  .locator('tr.va-menu-item');

const createNotifications = async ({ request, token }) => {
  const created = [];
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < NUMBER_OF_NOTIFICATIONS; i++) {
    // eslint-disable-next-line no-await-in-loop
    const createNotificationResponse = await createNotification({
      requestContext: request,
      token,
      url: `/notifications/${createdA.id}/state`,
      data: { is_bookmarked: true },
    });

    await refreshNotificationView(page);
    await page.getByTestId('filter-read').click();

    const readTotalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        read: true,
        limit: 1,
        offset: 0,
      },
    });
    expect(readTotalRes.status()).toBe(200);
    const readTotalBody = await readTotalRes.json();
    const readTotal = Number(readTotalBody.total || 0);
    await expect(notificationOpenButtonCount(page)).toContainText(countContains(readTotal));

    await page.getByTestId('filter-bookmarked').click();
    const readBookmarkedTotalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        read: true,
        bookmarked: true,
        limit: 1,
        offset: 0,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    const notification = await createNotificationResponse.json();
    created.push(notification);
  }
  return created;
};

test.beforeEach(async ({ page }) => {
  // delete active notifications before each test
  await page.goto('/');
  // const { request } = page;
  const token = await page.evaluate(() => localStorage.getItem('token'));

  // await deleteActiveNotifications(request, token);
  await deleteNotifications({
    requestContext: page.request,
    params: {
      status: 'CREATED',
    },
    token,
  });
});

test.describe.serial('Notifications', () => {
  test('No notifications exist', async ({ page }) => {
    await expect(notificationBadgeLocator(page)).toBeEmpty();

    // Assert that no notifications are active
    // open the notification menu
    await page.getByTestId('notification-icon').click();
    await expect(page.getByTestId('notification-menu-items'))
      .toContainText('No pending notifications');
    await expect(notificationMenuItemLocator(page)).toHaveCount(1);
    // close the notification menu
    await page.getByTestId('notification-icon').click();
  });

  test('Notification created', async ({ page }) => {
    let createdNotifications;

    await test.step('Create notifications', async () => {
      await page.goto('/');
      const token = await page.evaluate(() => localStorage.getItem('token'));

      const { request } = page;

      createdNotifications = await createNotifications({ request, token });
    });

    await menu.getByTestId('clear-notification-filters').click();
    await expect(searchInput(page)).toHaveValue('');
    await expect(menu.getByTestId('clear-notification-filters')).toHaveCount(0);
  });

  test('direct notification to user stays invisible to admin/operator', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
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

    await refreshNotificationView(page);
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
  });

  test('same notification keeps recipient state independent across users', async ({ page, browser }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Cross-user state test runs once under admin project');
    const { token, userId: adminUserId } = await fetchCurrentUser({ page, role: 'admin' });
    const operatorUser = await fetchUserByTicket({ page, ticket: 'operator' });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-state-isolation-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userIds: [Number(adminUserId), Number(operatorUser.id)],
      label,
      text: `Body for ${label}`,
    });
    await refreshNotificationView(page);

    const operatorContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const operatorPage = await operatorContext.newPage();
    await loginAsTicket({
      page: operatorPage,
      ticket: 'operator',
      expectedUsername: operatorUser.username,
    });
    await ensureNotificationOpenButtonVisible(operatorPage);
    await openNotificationsMenu(operatorPage);

    const adminLabel = page.getByTestId(labelById(created.id));
    const operatorLabel = operatorPage.getByTestId(labelById(created.id));

    await expect(adminLabel).toBeVisible();
    await expect(operatorLabel).toBeVisible();

    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(adminLabel).toHaveCount(0);
    await expect(operatorLabel).toBeVisible();

    await operatorPage.getByTestId(toggleReadById(created.id)).click();
    await expect(operatorLabel).toHaveCount(0);

    await page.getByTestId('filter-read').click();
    await expect(adminLabel).toBeVisible();

    await operatorPage.getByTestId('filter-read').click();
    await expect(operatorLabel).toBeVisible();

    await operatorContext.close();
  });

  test('new notification appears in menu after polling refresh', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Polling timing test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-poll-notify-${suffix}`;

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await openNotificationsMenu(page);
    await waitForNotificationMenuListIdle(page);
    await expect(page.getByTestId(labelById(created.id))).toBeVisible({ timeout: 15000 });
  });

  test('untrusted external link shows confirmation modal before navigation', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Link warning test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-untrusted-link-${suffix}`,
      text: 'Link warning test',
      metadata: {
        links: [
          { href: 'https://external-example.com/page', label: 'External Link', trusted: false },
        ],
      },
    });

    await refreshNotificationView(page);
    await expect(page.getByTestId(labelById(created.id))).toBeVisible();

    const linkButton = page.locator(`[data-testid="${labelById(created.id)}"]`)
      .locator('..')
      .locator('..')
      .getByText('External Link');
    await linkButton.click();

    const modalTitle = page
      .locator('.va-modal .va-modal__title')
      .getByText('Untrusted Link', { exact: true });
    await expect(modalTitle).toBeVisible({ timeout: 3000 });

    const modalBody = page.locator('.va-modal .va-modal__message');
    await expect(modalBody).toContainText(/untrusted link/i);

    const cancelButton = page.locator('.va-modal').getByRole('button', { name: 'Cancel' }).first();
    await expect(cancelButton).toBeVisible();
    await cancelButton.focus();
    await page.keyboard.press('Enter');
    await expect(modalTitle).not.toBeVisible({ timeout: 3000 });
  });

  test('trusted link navigates without confirmation modal', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Trusted link test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-trusted-link-${suffix}`,
      text: 'Trusted link test',
      metadata: {
        links: [
          { href: '/datasets', label: 'View Datasets', trusted: true },
        ],
      },
    });

    await refreshNotificationView(page);
    await expect(page.getByTestId(labelById(created.id))).toBeVisible();

    const linkButton = page.locator(`[data-testid="${labelById(created.id)}"]`)
      .locator('..')
      .locator('..')
      .getByText('View Datasets');
    await linkButton.click();

    const modal = page.locator('.va-modal').getByText('Untrusted Link', { exact: false });
    await expect(modal).not.toBeVisible({ timeout: 2000 });
  });

  test('add recipients extends an existing notification to another user', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Recipient add test runs once under admin project');
    const { token, userId: adminUserId } = await fetchCurrentUser({ page, role });
    const operatorUser = await fetchUserByTicket({ page, ticket: 'operator' });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-add-recipient-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId: adminUserId,
      label,
      text: `Body for ${label}`,
    });

    const addRecipientRes = await post({
      requestContext: page.request,
      token,
      url: `/notifications/${created.id}/recipients`,
      data: { user_ids: [Number(operatorUser.id)] },
    });
    expect(addRecipientRes.status()).toBe(200);
    const body = await addRecipientRes.json();
    expect(body.created_count).toBeGreaterThanOrEqual(1);
  });
});
