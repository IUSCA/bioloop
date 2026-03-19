const { randomUUID } = require('node:crypto');
const http = require('node:http');
const { test, expect } = require('@playwright/test');
const config = require('config');
const { post, patch } = require('../../../../api');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

const currentRole = (projectName) => (projectName.includes('operator') ? 'operator' : 'admin');
const labelById = (id) => `notification-${id}-label`;
const toggleReadById = (id) => `notification-${id}-toggle-read`;
const toggleBookmarkById = (id) => `notification-${id}-toggle-bookmark`;
const toggleArchiveById = (id) => `notification-${id}-toggle-archive`;
const globalDismissById = (id) => `notification-${id}-global-dismiss`;
const notificationVisibleCount = (page) => page.getByTestId('notification-visible-count');
const notificationBellCount = async (page) => {
  const text = (await page.getByTestId('notification-count').innerText()) || '';
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

const getToken = async (page) => page.evaluate(() => localStorage.getItem('token'));
const parseTokenProfile = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).profile;

const openNotificationsMenu = async (page) => {
  const menu = page.getByTestId('notification-menu-items');
  for (let i = 0; i < 3; i += 1) {
    if (await menu.isVisible()) {
      return;
    }
    await page.getByTestId('notification-icon').click();
    // Vuestic menu can animate open; short wait keeps this deterministic.
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);
  }
  await expect(menu).toBeVisible();
};

const fetchCurrentUser = async ({ page, role }) => {
  const token = await getToken(page);
  const profile = parseTokenProfile(token);
  return { token, username: profile.username, userId: profile.id, role };
};

const fetchUserByTicket = async ({ page, ticket }) => {
  const response = await page.request.post(`${config.apiBaseURL}/auth/cas/verify`, {
    data: { ticket },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const profile = parseTokenProfile(body.token);
  return {
    token: body.token,
    id: profile.id,
    username: profile.username,
  };
};

const createDirectNotification = async ({
  page,
  token,
  userId = null,
  userIds = [],
  label,
  text,
}) => {
  const recipientUserIds = userIds.length > 0 ? userIds : [userId];
  const response = await post({
    requestContext: page.request,
    token,
    url: '/notifications',
    data: {
      type: 'E2E_TEST',
      label,
      text,
      metadata: {},
      user_ids: recipientUserIds,
    },
  });
  if (response.status() !== 200) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Create notification failed: ${response.status()} ${JSON.stringify(body)}`);
  }
  return response.json();
};

const refreshNotificationView = async (page) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureNotificationIconVisible(page);
  await openNotificationsMenu(page);
};

const ensureNotificationIconVisible = async (page) => {
  const icon = page.getByTestId('notification-icon');
  for (let i = 0; i < 3; i += 1) {
    if (await icon.isVisible()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(icon).toBeVisible();
};

const openDirectSseWatcher = ({ token }) => {
  const baseUrl = process.env.TEST_DIRECT_API_BASE_URL || 'http://localhost:14303';
  const streamUrl = new URL(`/notifications/stream?token=${encodeURIComponent(token)}`, baseUrl);
  let req = null;
  let res = null;
  let buffer = '';
  let onEvent = null;
  let closed = false;

  const readyPromise = new Promise((resolve, reject) => {
    req = http.request(streamUrl, { method: 'GET', headers: { Accept: 'text/event-stream' } }, (_res) => {
      res = _res;
      if (res.statusCode !== 200) {
        reject(new Error(`SSE stream open failed with status ${res.statusCode}`));
        return;
      }
      onEvent = (event, payload) => {
        if (event === 'ready') {
          resolve(payload);
        }
      };
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        let delimiterIndex = buffer.indexOf('\n\n');
        while (delimiterIndex >= 0) {
          const rawEvent = buffer.slice(0, delimiterIndex);
          buffer = buffer.slice(delimiterIndex + 2);
          const eventLine = rawEvent.split('\n').find((line) => line.startsWith('event:'));
          const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
          const eventName = eventLine ? eventLine.replace('event:', '').trim() : 'message';
          const data = dataLine ? JSON.parse(dataLine.replace('data:', '').trim()) : null;
          if (onEvent) onEvent(eventName, data);
          delimiterIndex = buffer.indexOf('\n\n');
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  const waitForNotification = ({ timeoutMs = 4500 } = {}) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for SSE notification event after ${timeoutMs}ms`));
    }, timeoutMs);
    const previousOnEvent = onEvent;
    onEvent = (event, payload) => {
      if (previousOnEvent) previousOnEvent(event, payload);
      if (event === 'notification') {
        clearTimeout(timeout);
        resolve({
          atMs: Date.now(),
          payload,
        });
      }
    };
  });

  const close = () => {
    if (closed) return;
    closed = true;
    if (res) res.destroy();
    if (req) req.destroy();
  };

  return {
    readyPromise,
    waitForNotification,
    close,
  };
};

const loginAsTicket = async ({ page, ticket, expectedUsername }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=${ticket}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('header-username')).toContainText(expectedUsername);
};

const attachUiErrorTracker = (page) => {
  const errors = [];
  const onPageError = (err) => {
    errors.push(String(err));
  };
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  return {
    assertNoHierarchyError: () => {
      const hierarchyErrors = errors.filter((e) => e.includes('HierarchyRequestError'));
      expect(hierarchyErrors).toEqual([]);
    },
    detach: () => {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    },
  };
};

test.describe.serial('Notifications (admin/operator)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationIconVisible(page);
    await openNotificationsMenu(page);
    const clearFiltersBtn = page.getByTestId('clear-notification-filters');
    if (await clearFiltersBtn.count()) {
      await clearFiltersBtn.click();
    }
  });

  test('read/unread toggle hides row from default and restores in read filter', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-read-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const createdLabel = page.getByTestId(labelById(created.id));
    await expect(createdLabel).toBeVisible();
    await expect(createdLabel.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]'))
      .toContainText('Direct');

    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(createdLabel).toHaveCount(0);

    await page.getByTestId('filter-read').click();
    await expect(createdLabel).toBeVisible();

    await page.locator('[data-testid="active-filter-chip-read-clear"]:visible').click();
    await expect(createdLabel).toHaveCount(0);
  });

  test('bookmark/archive filters can be toggled and cleared via chips', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-state-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const createdLabel = page.getByTestId(labelById(created.id));
    await expect(createdLabel).toBeVisible();

    await page.getByTestId(toggleBookmarkById(created.id)).click();
    await page.getByTestId('filter-bookmarked').click();
    await expect(createdLabel).toBeVisible();
    await page.locator('[data-testid="active-filter-chip-bookmarked-clear"]:visible').click();
    const clearFiltersButton = page.getByTestId('clear-notification-filters');
    if (await clearFiltersButton.count()) {
      await clearFiltersButton.click();
    }
    await expect(createdLabel).toBeVisible();

    await page.getByTestId(toggleArchiveById(created.id)).click();
    await expect(createdLabel).toHaveCount(0);
    await page.getByTestId('filter-archived').click();
    await expect(createdLabel).toBeVisible();
    await page.locator('[data-testid="active-filter-chip-archived-clear"]:visible').click();
    await expect(createdLabel).toHaveCount(0);
  });

  test('search chip clears via chip clear control', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-search-${suffix}`;

    await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const searchInput = page.locator('input[data-testid="notification-search"]:visible').first();
    await searchInput.fill(label);
    await expect(page.getByText(`Search: ${label}`)).toBeVisible();

    const searchChipClear = page.locator('[data-testid="active-filter-chip-search-clear"]:visible').first();
    await expect(searchChipClear).toBeVisible();
    await searchChipClear.click({ force: true });
    await expect(searchInput).toHaveValue('');
  });

  test('mark all as read removes unread rows and shows under read filter', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const createdA = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-mark-all-A-${suffix}`,
      text: 'mark-all body A',
    });
    const createdB = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-mark-all-B-${suffix}`,
      text: 'mark-all body B',
    });

    await refreshNotificationView(page);
    const labelA = page.getByTestId(labelById(createdA.id));
    const labelB = page.getByTestId(labelById(createdB.id));
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();

    await page.getByTestId('mark-all-read').click();
    await expect(labelA).toHaveCount(0);
    await expect(labelB).toHaveCount(0);

    await page.getByTestId('filter-read').click();
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
  });

  test('admin/operator can globally dismiss and view under dismissed filter', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId, username } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-dismiss-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const createdLabel = page.getByTestId(labelById(created.id));
    await expect(createdLabel).toBeVisible();
    await page.getByTestId(globalDismissById(created.id)).click();
    await expect(createdLabel).toHaveCount(0);

    await page.getByTestId('filter-globally-dismissed').click();
    await expect(createdLabel).toBeVisible();
    await expect(
      createdLabel.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]'),
    ).toContainText(`Dismissed by ${username}`);
  });

  test('notification count indicator changes when filters change', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const labelPrefix = `E2E-${role}-count-${suffix}`;

    const createdA = await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-A`,
      text: 'badge body A',
    });
    await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-B`,
      text: 'badge body B',
    });
    await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-C`,
      text: 'badge body C',
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${createdA.id}/state`,
      data: { is_bookmarked: true },
    });

    await refreshNotificationView(page);
    const searchInput = page.locator('input[data-testid="notification-search"]:visible').first();
    await searchInput.fill(labelPrefix);
    const initialVisibleCountText = (await notificationVisibleCount(page).textContent()) || '';
    const initialVisibleCount = Number((initialVisibleCountText.match(/\d+/) || [0])[0]);
    expect(initialVisibleCount).toBe(3);

    await page.getByTestId('filter-bookmarked').click();
    await expect.poll(async () => {
      const filteredVisibleCountText = (await notificationVisibleCount(page).textContent()) || '';
      return Number((filteredVisibleCountText.match(/\d+/) || [0])[0]);
    }).toBe(1);

    await page.getByTestId('filter-bookmarked').click();
    await expect.poll(async () => {
      const clearVisibleCountText = (await notificationVisibleCount(page).textContent()) || '';
      return Number((clearVisibleCountText.match(/\d+/) || [0])[0]);
    }).toBe(initialVisibleCount);
  });

  test('bell badge count updates with selected filters and search', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const labelPrefix = `E2E-${role}-badge-${suffix}`;

    const createdA = await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-A`,
      text: 'badge filter A',
    });
    await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-B`,
      text: 'badge filter B',
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${createdA.id}/state`,
      data: { is_bookmarked: true },
    });

    await refreshNotificationView(page);
    const searchInput = page.locator('input[data-testid="notification-search"]:visible').first();
    await searchInput.fill(labelPrefix);

    await expect.poll(async () => notificationBellCount(page)).toBe(2);
    await page.getByTestId('filter-bookmarked').click();
    await expect.poll(async () => notificationBellCount(page)).toBe(1);
  });

  test('controls are disabled while notification fetch is in flight', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-${suffix}`,
      text: `loading state ${suffix}`,
    });
    await refreshNotificationView(page);

    const delayedReadFilterRequest = /\/api\/notifications\?.*read=true/;
    await page.route(delayedReadFilterRequest, async (route) => {
      await page.waitForTimeout(1200);
      await route.continue();
    });

    await page.getByTestId('filter-read').click();
    await expect(page.getByTestId('filter-read')).toBeDisabled();
    await expect(page.getByTestId('filter-bookmarked')).toBeDisabled();
    await expect(page.locator('input[data-testid="notification-search"]:visible').first()).toBeDisabled();

    await expect(page.getByTestId('filter-read')).toBeEnabled({ timeout: 6000 });
    await expect(page.getByTestId('filter-bookmarked')).toBeEnabled({ timeout: 6000 });
    await expect(page.locator('input[data-testid="notification-search"]:visible').first()).toBeEnabled({
      timeout: 6000,
    });
    await page.unroute(delayedReadFilterRequest);
  });

  test('read filter toggles chip cleanly with no duplicates', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-chip-toggle-${suffix}`,
      text: `Body for chip toggle ${suffix}`,
    });
    await refreshNotificationView(page);

    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('filter-read').click();
      await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(1);
      await page.locator('[data-testid="active-filter-chip-read-clear"]:visible').click();
      await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(0);
    }
  });

  test('filter buttons stay synced with filter chips and no hierarchy errors', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const tracker = attachUiErrorTracker(page);

    await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-sync-${suffix}`,
      text: `Body for sync ${suffix}`,
    });

    await refreshNotificationView(page);
    await page.getByTestId('filter-read').click();
    await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(1);

    await page.getByTestId('filter-archived').click();
    await expect(page.locator('[data-testid="active-filter-chip-archived"]:visible')).toHaveCount(1);

    await page.getByTestId('filter-bookmarked').click();
    await expect(page.locator('[data-testid="active-filter-chip-bookmarked"]:visible')).toHaveCount(1);

    await page.locator('[data-testid="active-filter-chip-read-clear"]:visible').click();
    await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(0);

    await page.locator('[data-testid="active-filter-chip-archived-clear"]:visible').click();
    await expect(page.locator('[data-testid="active-filter-chip-archived"]:visible')).toHaveCount(0);

    await page.locator('[data-testid="active-filter-chip-bookmarked-clear"]:visible').click();
    await expect(page.locator('[data-testid="active-filter-chip-bookmarked"]:visible')).toHaveCount(0);

    tracker.assertNoHierarchyError();
    tracker.detach();
  });

  test('combined read+bookmarked filter keeps intersection only', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const intersectionNotification = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-A-${suffix}`,
      text: 'intersection A',
    });
    const nonIntersectionNotification = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-B-${suffix}`,
      text: 'intersection B',
    });

    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${intersectionNotification.id}/state`,
      data: { is_bookmarked: true, is_read: true },
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${nonIntersectionNotification.id}/state`,
      data: { is_bookmarked: true, is_read: false },
    });

    await refreshNotificationView(page);

    await page.getByTestId('filter-read').click();
    await page.getByTestId('filter-bookmarked').click();

    await expect(page.getByTestId(labelById(intersectionNotification.id))).toBeVisible();
    await expect(page.getByTestId(labelById(nonIntersectionNotification.id))).toHaveCount(0);
  });

  test('clear filters resets search and toggle filters together', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-clear-filters-${suffix}`;

    await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `body ${label}`,
    });

    await refreshNotificationView(page);
    const searchInput = page.locator('input[data-testid="notification-search"]:visible').first();
    await searchInput.fill(label);
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.getByText(`Search: ${label}`)).toBeVisible();
    await expect(page.getByTestId('clear-notification-filters')).toBeVisible();

    await page.getByTestId('clear-notification-filters').click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByTestId('clear-notification-filters')).toHaveCount(0);
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
    test.setTimeout(60000);
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
    await ensureNotificationIconVisible(operatorPage);
    await openNotificationsMenu(operatorPage);

    const adminLabel = page.getByTestId(labelById(created.id));
    const operatorLabel = operatorPage.getByTestId(labelById(created.id));

    await expect(adminLabel).toBeVisible();
    await expect(operatorLabel).toBeVisible();

    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(adminLabel).toHaveCount(0);
    await expect(operatorLabel).toBeVisible();

    await operatorPage.getByTestId(toggleArchiveById(created.id)).click();
    await expect(operatorLabel).toHaveCount(0);

    await page.getByTestId('filter-read').click();
    await expect(adminLabel).toBeVisible();

    await operatorPage.getByTestId('filter-archived').click();
    await expect(operatorLabel).toBeVisible();

    await operatorContext.close();
  });

  test('new notifications appear before polling interval when SSE is ready', async ({ page }, testInfo) => {
    test.setTimeout(45000);
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'SSE timing test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-sse-realtime-${suffix}`;

    const sseWatcher = openDirectSseWatcher({ token });
    await sseWatcher.readyPromise;
    const notificationEventPromise = sseWatcher.waitForNotification({ timeoutMs: 4500 });

    const beforeCreate = Date.now();
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    const sseEvent = await notificationEventPromise;
    expect(sseEvent.payload?.reason).toBe('created');
    expect(sseEvent.atMs - beforeCreate).toBeLessThan(4500);
    sseWatcher.close();

    await openNotificationsMenu(page);
    await expect(page.getByTestId(labelById(created.id))).toBeVisible({ timeout: 9000 });
  });
});
