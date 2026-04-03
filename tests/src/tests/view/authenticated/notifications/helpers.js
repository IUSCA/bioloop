/* cspell:ignore pageerror */
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
const { expect } = require('@playwright/test');
const config = require('config');
const { get, patch, post } = require('../../../../api');

/** @returns {string} data-testid for a notification's label element */
const labelById = (id) => `notification-${id}-label`;
/** @returns {string} data-testid for toggle-read button. */
const toggleReadById = (id) => `notification-${id}-toggle-read`;
/** @returns {string} data-testid for toggle-bookmark button. */
const toggleBookmarkById = (id) => `notification-${id}-toggle-bookmark`;
/** @returns {RegExp} Regex matching an integer as a standalone word. */
const countContains = (count) => new RegExp(`\\b${count}\\b`);
/** @returns {'admin'|'operator'} Role inferred from project name. */
const currentRole = (projectName) => (projectName.includes('operator') ? 'operator' : 'admin');

/** Locator for the "Showing N of M" text inside the open notification menu. */
const notificationVisibleCount = (page) => page.getByTestId('notification-visible-count');
/**
 * Locator for the bell badge count. Uses a compound selector to avoid
 * matching hidden/teleported duplicates that Vuestic may leave in the DOM.
 */
const notificationOpenButtonCount = (page) =>
  page.locator('[data-testid="notification-count"]:has([data-testid="notification-open-button"]:visible)').first();

/**
 * Notification menu panel node (scoped under the dropdown root).
 * Uses attachment/count checks instead of Playwright "visible": the panel can be
 * attached while still reported hidden (e.g. loading overlay / dialog semantics).
 */
const visibleNotificationMenu = (page) =>
  page.locator('.notification-dropdown-root [data-testid="notification-menu-items"]').first();

/** Locator for the notification search input inside the visible menu panel. */
const searchInput = (page) =>
  visibleNotificationMenu(page).getByPlaceholder('Search notifications').first();

/**
 * Wait until the notifications panel reports it is not loading (list fetch
 * or mutation). NotificationDropdown sets aria-busy from Pinia listFetching /
 * mutationPending only.
 */
const waitForNotificationMenuListIdle = async (page) => {
  const menu = visibleNotificationMenu(page);
  await expect
    .poll(async () => {
      if ((await menu.count()) === 0) return false;
      const raw = await menu.getAttribute('aria-busy');
      return raw !== 'true';
    }, { timeout: 120000 })
    .toBe(true);
};

/**
 * After the menu opens, the first top control should receive focus (see
 * NotificationDropdown focusFirstMenuControlSoon). Polls until the visible
 * initial-focus host or filter-unread contains the active element.
 */
const expectNotificationMenuInitialFocusSettled = async (page) => {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const visible = (selector) =>
            Array.from(document.querySelectorAll(selector)).find(
              (n) => n instanceof HTMLElement && n.offsetParent !== null,
            );
          const initial =
            visible('[data-notification-menu-initial-focus]') ||
            visible('[data-testid="filter-unread"]');
          const active = document.activeElement;
          return Boolean(
            initial instanceof HTMLElement &&
              active &&
              (initial === active || initial.contains(active)),
          );
        }),
      { timeout: 15000 },
    )
    .toBe(true);
};

/**
 * Vuestic often moves focus to an inner node (icon, inner button) while the
 * interactive control is the outer host. Use this instead of expect(loc).toBeFocused().
 */
const locatorContainsActiveElement = async (locator) =>
  locator.evaluate((el) => {
    const active = document.activeElement;
    return Boolean(active && (el === active || el.contains(active)));
  });

/** Decodes JWT payload and returns `profile` object. */
const parseTokenProfile = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).profile;
/** Reads the current auth token from localStorage. */
const getToken = async (page) => page.evaluate(() => localStorage.getItem('token'));

/**
 * Opens the notification menu (if closed) and waits for idle list state.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
const openNotificationsMenu = async (page) => {
  const menu = visibleNotificationMenu(page);
  if ((await menu.count()) > 0) {
    await waitForNotificationMenuListIdle(page);
    return menu;
  }
  await ensureNotificationOpenButtonVisible(page);
  await expect(async () => {
    if ((await menu.count()) > 0) return;
    await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid="notification-open-button"]'),
      );
      const ordered = [
        ...nodes.filter((n) => n instanceof HTMLElement && n.offsetParent !== null),
        ...nodes.filter((n) => n instanceof HTMLElement && n.offsetParent === null),
      ];
      for (const node of ordered) {
        if (!(node instanceof HTMLElement)) continue;
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        node.click();
      }
    });
    await expect(menu).toBeAttached({ timeout: 3000 });
  }).toPass({ timeout: 15000 });
  await waitForNotificationMenuListIdle(page);
  return menu;
};

/**
 * Returns the visible menu panel, opening the dropdown first if it was closed
 * (for example after a list refresh).
 */
const ensureNotificationsMenuOpen = async (page) => {
  const menu = visibleNotificationMenu(page);
  if ((await menu.count()) === 0) {
    await openNotificationsMenu(page);
  } else {
    await waitForNotificationMenuListIdle(page);
  }
  return visibleNotificationMenu(page);
};

/**
 * Ensures the notification bell icon is visible, reloading the page
 * up to 6 times if needed (handles feature-flag timing or slow hydration).
 */
const ensureNotificationOpenButtonVisible = async (page) => {
  const notificationOpenButton = page.locator('[data-testid="notification-open-button"]:visible').first();
  for (let i = 0; i < 6; i += 1) {
    if (await notificationOpenButton.isVisible()) return;
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(notificationOpenButton).toBeVisible({ timeout: 15000 });
};

/**
 * Reloads the page and reopens notifications menu in an attached/ready state.
 * @param {import('@playwright/test').Page} page
 */
const refreshNotificationView = async (page) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureNotificationOpenButtonVisible(page);
  await openNotificationsMenu(page);
  await expect(visibleNotificationMenu(page)).toBeAttached({ timeout: 15000 });
};

/**
 * Returns token + normalized profile fields for the current session.
 * @param {{page: import('@playwright/test').Page, role?: string|null}} params
 * @returns {Promise<{token: string, username: string, userId: number, role: string|null}>}
 */
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

/**
 * Exchanges CAS ticket for JWT using API endpoint.
 * @param {{page: import('@playwright/test').Page, ticket: string}} params
 * @returns {Promise<string>}
 */
const getTokenByTicket = async ({ page, ticket }) => {
  const response = await page.request.post(`${config.apiBaseURL}/auth/cas/verify`, {
    data: { ticket },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.token;
};

/**
 * Resolves user identity for a CAS ticket.
 * @param {{page: import('@playwright/test').Page, ticket: string}} params
 * @returns {Promise<{token: string, id: number, username: string}>}
 */
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

/**
 * Finds one notification item by id from either array payload or `{items}`.
 * @param {any[]|{items?: any[]}} body
 * @param {number|string} notificationId
 * @returns {any|undefined}
 */
const findNotificationInListPayload = (body, notificationId) => {
  const items = Array.isArray(body) ? body : body?.items;
  if (!Array.isArray(items)) return undefined;
  return items.find((n) => Number(n.id) === Number(notificationId));
};

/**
 * Fetches unread notifications using role-appropriate endpoint.
 * @param {{page: import('@playwright/test').Page, token: string, privileged: boolean, username: string}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
const fetchDefaultUnreadNotifications = async ({
  page,
  token,
  privileged,
  username,
}) => {
  const params = {
    read: false,
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

/**
 * Patches read/unread state for a notification.
 * @param {{page: import('@playwright/test').Page, token: string, privileged: boolean, username: string, notificationId: number|string, isRead: boolean}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Patches bookmark state for a notification.
 * @param {{page: import('@playwright/test').Page, token: string, privileged: boolean, username: string, notificationId: number|string, isBookmarked: boolean}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Marks all notifications as read for the current user context.
 * @param {{page: import('@playwright/test').Page, token: string, privileged: boolean, username: string}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/** Convenience helper to fetch admin JWT from the CAS stub. */
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

/**
 * Asserts that notification header controls are disabled.
 * @param {import('@playwright/test').Page} page
 */
const expectHeaderControlsDisabled = async (page) => {
  await expect(page.getByTestId('filter-unread')).toBeDisabled();
  await expect(page.getByTestId('filter-read')).toBeDisabled();
  await expect(page.getByTestId('filter-bookmarked')).toBeDisabled();
  await expect(page.getByTestId('mark-all-read')).toBeDisabled();
  await expect(searchInput(page)).toBeDisabled();
  const clearFilters = page.getByTestId('clear-notification-filters');
  if (await clearFilters.count()) {
    await expect(clearFilters).toBeDisabled();
  }
};

/**
 * Asserts that notification header controls are enabled.
 * @param {import('@playwright/test').Page} page
 */
const expectHeaderControlsEnabled = async (page) => {
  await expect(page.getByTestId('filter-unread')).toBeEnabled();
  await expect(page.getByTestId('filter-read')).toBeEnabled();
  await expect(page.getByTestId('filter-bookmarked')).toBeEnabled();
  await expect(page.getByTestId('mark-all-read')).toBeEnabled();
  await expect(searchInput(page)).toBeEnabled();
  const clearFilters = page.getByTestId('clear-notification-filters');
  if (await clearFilters.count()) {
    await expect(clearFilters).toBeEnabled();
  }
};

/**
 * Logs in via CAS ticket and verifies username in header.
 * @param {{page: import('@playwright/test').Page, ticket: string, expectedUsername: string}} params
 */
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
  expectNotificationMenuInitialFocusSettled,
  fetchCurrentUser,
  fetchDefaultUnreadNotifications,
  fetchUserByTicket,
  findNotificationInListPayload,
  getAdminToken,
  getToken,
  getTokenByTicket,
  labelById,
  loadStandardViewerProfiles,
  loginAsTicket,
  notificationOpenButtonCount,
  notificationVisibleCount,
  openNotificationsMenu,
  parseTokenProfile,
  patchMarkAllRead,
  patchNotificationBookmarkState,
  patchNotificationReadState,
  visibleNotificationMenu,
  locatorContainsActiveElement,
  refreshNotificationView,
  searchInput,
  waitForNotificationMenuListIdle,
  toggleBookmarkById,
  toggleReadById,
};
