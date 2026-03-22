/**
 * Shared E2E helpers for notification spec files.
 *
 * Test-id factories (labelById, toggleReadById, etc.) return data-testid
 * strings for per-notification action buttons rendered by Notification.vue.
 *
 * Auth helpers (getToken, parseTokenProfile, getTokenByTicket, fetchUserByTicket)
 * work with the E2E CAS stub — the "ticket" parameter is a fixture username
 * (e.g. 'admin', 'user') that the stub resolves into a real JWT.
 */
const http = require('node:http');
const https = require('node:https');
const { expect } = require('@playwright/test');
const config = require('config');
const { get, patch, post } = require('../../../../api');

/** @returns {string} data-testid for a notification's label element */
const labelById = (id) => `notification-${id}-label`;
const toggleReadById = (id) => `notification-${id}-toggle-read`;
const toggleBookmarkById = (id) => `notification-${id}-toggle-bookmark`;
const withdrawById = (id) => `notification-${id}-withdraw`;
const countContains = (count) => new RegExp(`\\b${count}\\b`);
const currentRole = (projectName) => (projectName.includes('operator') ? 'operator' : 'admin');

/** Locator for the "Showing N of M" text inside the open notification menu. */
const notificationVisibleCount = (page) => page.getByTestId('notification-visible-count');
/**
 * Locator for the bell badge count. Uses a compound selector to avoid
 * matching hidden/teleported duplicates that Vuestic may leave in the DOM.
 */
const notificationOpenButtonCount = (page) =>
  page.locator('[data-testid="notification-count"]:has([data-testid="notification-open-button"]:visible)').first();

/** Visible notification dropdown panel (avoids hidden Vuestic menu clones in the DOM). */
const visibleNotificationMenu = (page) =>
  page.locator('[data-testid="notification-menu-items"]:visible').first();

const searchInput = (page) =>
  visibleNotificationMenu(page).getByPlaceholder('Search notifications').first();

/**
 * Vuestic often moves focus to an inner node (icon, inner button) while the
 * interactive control is the outer host. Use this instead of expect(loc).toBeFocused().
 */
const locatorContainsActiveElement = async (locator) =>
  locator.evaluate((el) => {
    const active = document.activeElement;
    return Boolean(active && (el === active || el.contains(active)));
  });

/**
 * Fails if the search filter chip is still attached and visible in the menu.
 * Prefer this over toHaveCount(0), which can miss visible duplicates outside the scoped locator.
 */
const expectSearchFilterChipHidden = async (menu, { timeout = 15000 } = {}) => {
  await expect(menu.getByTestId('active-filter-chip-search')).toBeHidden({ timeout });
};

const parseTokenProfile = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).profile;
const getToken = async (page) => page.evaluate(() => localStorage.getItem('token'));

/**
 * Returns the visible menu panel, opening the dropdown first if it was closed
 * (for example after a list refresh).
 */
const ensureNotificationsMenuOpen = async (page) => {
  const menu = visibleNotificationMenu(page);
  if (await menu.isVisible()) return menu;
  await openNotificationsMenu(page);
  return visibleNotificationMenu(page);
};

const openNotificationsMenu = async (page) => {
  const menu = visibleNotificationMenu(page);
  if (await menu.isVisible()) return menu;
  const buttons = page.getByTestId('notification-open-button');
  await expect(buttons.first()).toBeAttached({ timeout: 15000 });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = buttons.nth(i);
    // Vuestic can leave non-interactive duplicates in the DOM; only the visible
    // bell should receive the open action.
    // eslint-disable-next-line no-await-in-loop
    if (await candidate.isVisible()) {
      // eslint-disable-next-line no-await-in-loop
      await candidate.evaluate((el) => {
        if (el instanceof HTMLElement) el.click();
      });
      await expect(menu).toBeVisible({ timeout: 15000 });
      return menu;
    }
  }
  await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll('[data-testid="notification-open-button"]'),
    );
    const pick =
      nodes.find((n) => n instanceof HTMLElement && n.offsetParent !== null)
      || nodes.find((n) => n instanceof HTMLElement);
    if (pick instanceof HTMLElement) {
      pick.click();
    }
  });
  await expect(menu).toBeVisible({ timeout: 15000 });
  return menu;
};

/**
 * Ensures the notification bell icon is visible, reloading the page
 * up to 3 times if needed (handles feature-flag timing or slow hydration).
 */
const ensureNotificationOpenButtonVisible = async (page) => {
  const notificationOpenButton = page.getByTestId('notification-open-button');
  for (let i = 0; i < 3; i += 1) {
    if (await notificationOpenButton.isVisible()) return;
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(notificationOpenButton).toBeVisible();
};

const refreshNotificationView = async (page) => {
  await page.reload({ waitUntil: 'load' });
  await ensureNotificationOpenButtonVisible(page);
  await openNotificationsMenu(page);
  await expect(visibleNotificationMenu(page)).toBeVisible({ timeout: 15000 });
};

const fetchCurrentUser = async ({ page, role = null }) => {
  const token = await getToken(page);
  const profile = parseTokenProfile(token);
  return {
    token,
    username: profile.username,
    userId: Number(profile.id),
    role,
  };
};

const getTokenByTicket = async ({ page, ticket }) => {
  const response = await page.request.post(`${config.apiBaseURL}/auth/cas/verify`, {
    data: { ticket },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.token;
};

const fetchUserByTicket = async ({ page, ticket }) => {
  const token = await getTokenByTicket({ page, ticket });
  const profile = parseTokenProfile(token);
  return {
    token,
    id: Number(profile.id),
    username: profile.username,
  };
};

/**
 * Viewer profile for cross-user notification API checks (admin/operator use
 * general routes; user uses ownership-scoped routes).
 */
const loadStandardViewerProfiles = async (page) => {
  const admin = await fetchUserByTicket({ page, ticket: 'admin' });
  const operator = await fetchUserByTicket({ page, ticket: 'operator' });
  const user = await fetchUserByTicket({ page, ticket: 'user' });
  return {
    admin: {
      key: 'admin',
      token: admin.token,
      username: admin.username,
      userId: admin.id,
      privileged: true,
    },
    operator: {
      key: 'operator',
      token: operator.token,
      username: operator.username,
      userId: operator.id,
      privileged: true,
    },
    user: {
      key: 'user',
      token: user.token,
      username: user.username,
      userId: user.id,
      privileged: false,
    },
  };
};

const findNotificationInListPayload = (body, notificationId) => {
  const items = Array.isArray(body) ? body : body?.items;
  if (!Array.isArray(items)) return undefined;
  return items.find((n) => Number(n.id) === Number(notificationId));
};

const fetchDefaultUnreadNotifications = async ({
  page,
  token,
  privileged,
  username,
}) => {
  const params = {
    read: false,
    withdrawn: false,
    limit: 100,
    offset: 0,
  };
  if (privileged) {
    return get({
      requestContext: page.request,
      token,
      url: '/notifications',
      params,
    });
  }
  return get({
    requestContext: page.request,
    token,
    url: `/notifications/${encodeURIComponent(username)}/all`,
    params,
  });
};

const patchNotificationReadState = async ({
  page,
  token,
  privileged,
  username,
  notificationId,
  isRead,
}) => {
  const url = privileged
    ? `/notifications/${notificationId}/state`
    : `/notifications/${encodeURIComponent(username)}/${notificationId}/state`;
  return patch({
    requestContext: page.request,
    token,
    url,
    data: { is_read: isRead },
  });
};

const patchNotificationBookmarkState = async ({
  page,
  token,
  privileged,
  username,
  notificationId,
  isBookmarked,
}) => {
  const url = privileged
    ? `/notifications/${notificationId}/state`
    : `/notifications/${encodeURIComponent(username)}/${notificationId}/state`;
  return patch({
    requestContext: page.request,
    token,
    url,
    data: { is_bookmarked: isBookmarked },
  });
};

const patchNotificationWithdraw = async ({ page, token, notificationId }) =>
  patch({
    requestContext: page.request,
    token,
    url: `/notifications/${notificationId}/withdraw`,
    data: {},
  });

const patchMarkAllRead = async ({ page, token, privileged, username }) => {
  const url = privileged
    ? '/notifications/mark-all-read'
    : `/notifications/${encodeURIComponent(username)}/mark-all-read`;
  return patch({
    requestContext: page.request,
    token,
    url,
    data: {},
  });
};

const getAdminToken = async (page) => getTokenByTicket({ page, ticket: 'admin' });

/**
 * Creates a notification via the API, targeting specific users by ID.
 * Uses the Playwright request context so the call shares the test's
 * network/cookie state. Throws on non-200 responses.
 *
 * @param {Object} opts
 * @param {import('@playwright/test').Page} opts.page
 * @param {string} opts.token - Admin JWT for authorization
 * @param {number|null} [opts.userId] - Single recipient (convenience)
 * @param {number[]} [opts.userIds] - Multiple recipients (takes precedence)
 * @param {string} opts.label
 * @param {string} opts.text
 * @param {Object} [opts.metadata]
 */
const createDirectNotification = async ({
  page,
  token,
  userId = null,
  userIds = [],
  label,
  text,
  metadata = {},
}) => {
  const recipientUserIds = userIds.length > 0 ? userIds : [Number(userId)];
  const response = await post({
    requestContext: page.request,
    token,
    url: '/notifications',
    data: {
      type: 'E2E_TEST',
      label,
      text,
      metadata,
      user_ids: recipientUserIds,
    },
  });
  if (response.status() !== 200) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Create notification failed: ${response.status()} ${JSON.stringify(body)}`);
  }
  return response.json();
};

/**
 * Creates a ROLE_BROADCAST notification for one or more roles (Prisma role ids).
 */
const createRoleBroadcastNotification = async ({
  page,
  token,
  label,
  text,
  roleIds,
  metadata = {},
  type = 'E2E_TEST',
}) => {
  const response = await post({
    requestContext: page.request,
    token,
    url: '/notifications',
    data: {
      type,
      label,
      text,
      metadata,
      role_ids: roleIds,
    },
  });
  if (response.status() !== 200) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Create role broadcast notification failed: ${response.status()} ${JSON.stringify(body)}`);
  }
  return response.json();
};

/**
 * Convenience wrapper: creates a notification targeted at the 'user' fixture
 * account, using an admin token for authorization.
 */
const createDirectNotificationForUser = async ({ page, label, text, metadata = {} }) => {
  const adminToken = await getAdminToken(page);
  const userToken = await getTokenByTicket({ page, ticket: 'user' });
  const userId = parseTokenProfile(userToken).id;
  return createDirectNotification({
    page,
    token: adminToken,
    userId,
    label,
    text,
    metadata,
  });
};

const expectHeaderControlsDisabled = async (page) => {
  await expect(page.getByTestId('filter-unread')).toBeDisabled();
  await expect(page.getByTestId('filter-read')).toBeDisabled();
  await expect(page.getByTestId('filter-bookmarked')).toBeDisabled();
  const withdrawnFilter = page.getByTestId('filter-withdrawn');
  if (await withdrawnFilter.count()) {
    await expect(withdrawnFilter).toBeDisabled();
  }
  await expect(page.getByTestId('mark-all-read')).toBeDisabled();
  await expect(searchInput(page)).toBeDisabled();
  const clearFilters = page.getByTestId('clear-notification-filters');
  if (await clearFilters.count()) {
    await expect(clearFilters).toBeDisabled();
  }
};

const expectHeaderControlsEnabled = async (page) => {
  await expect(page.getByTestId('filter-unread')).toBeEnabled();
  await expect(page.getByTestId('filter-read')).toBeEnabled();
  await expect(page.getByTestId('filter-bookmarked')).toBeEnabled();
  const withdrawnFilter = page.getByTestId('filter-withdrawn');
  if (await withdrawnFilter.count()) {
    await expect(withdrawnFilter).toBeEnabled();
  }
  await expect(page.getByTestId('mark-all-read')).toBeEnabled();
  await expect(searchInput(page)).toBeEnabled();
  const clearFilters = page.getByTestId('clear-notification-filters');
  if (await clearFilters.count()) {
    await expect(clearFilters).toBeEnabled();
  }
};

/**
 * Opens a raw HTTP SSE connection to the notification stream endpoint,
 * bypassing the browser's EventSource API. Used to test SSE behavior
 * from the Node.js test runner process (not the browser context).
 *
 * Returns:
 * - `readyPromise`: resolves when the server sends the `ready` event
 * - `waitForNotification()`: resolves on next `notification` event
 * - `close()`: tears down the connection
 *
 * @param {{ token: string, streamPath?: string }} opts
 */
const openDirectSseWatcher = ({ token, streamPath = '/notifications/stream' }) => {
  const base = (
    process.env.TEST_DIRECT_API_BASE_URL
    || process.env.TEST_API_BASE_URL
    || 'http://localhost/api'
  ).replace(/\/$/, '');
  const path = streamPath.startsWith('/') ? streamPath : `/${streamPath}`;
  const streamUrl = new URL(`${base}${path}?token=${encodeURIComponent(token)}`);
  let req = null;
  let res = null;
  let buffer = '';
  let onEvent = null;
  let closed = false;

  const client = streamUrl.protocol === 'https:' ? https : http;
  const requestOpts = {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  };
  if (
    streamUrl.protocol === 'https:'
    && (streamUrl.hostname === 'localhost' || streamUrl.hostname === '127.0.0.1')
  ) {
    requestOpts.rejectUnauthorized = false;
  }

  const readyPromise = new Promise((resolve, reject) => {
    req = client.request(streamUrl, requestOpts, (_res) => {
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

/**
 * Attaches page-level error listeners to detect DOM hierarchy errors
 * (HierarchyRequestError) that indicate Vue/Vuestic teleport reconciliation
 * bugs. Call `assertNoHierarchyError()` after test interactions to verify,
 * and `detach()` in afterEach to clean up.
 */
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

module.exports = {
  ensureNotificationsMenuOpen,
  attachUiErrorTracker,
  countContains,
  createDirectNotification,
  createDirectNotificationForUser,
  createRoleBroadcastNotification,
  currentRole,
  ensureNotificationOpenButtonVisible,
  expectHeaderControlsDisabled,
  expectHeaderControlsEnabled,
  fetchCurrentUser,
  fetchDefaultUnreadNotifications,
  fetchUserByTicket,
  findNotificationInListPayload,
  getAdminToken,
  getToken,
  getTokenByTicket,
  withdrawById,
  labelById,
  loadStandardViewerProfiles,
  loginAsTicket,
  notificationOpenButtonCount,
  notificationVisibleCount,
  openDirectSseWatcher,
  openNotificationsMenu,
  parseTokenProfile,
  patchWithdraw: patchNotificationWithdraw,
  patchMarkAllRead,
  patchNotificationBookmarkState,
  patchNotificationReadState,
  visibleNotificationMenu,
  locatorContainsActiveElement,
  expectSearchFilterChipHidden,
  refreshNotificationView,
  searchInput,
  toggleBookmarkById,
  toggleReadById,
};
