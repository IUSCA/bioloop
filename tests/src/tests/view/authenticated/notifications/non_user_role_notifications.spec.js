const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const config = require('config');
const { post, patch } = require('../../../../api');
const {
  attachUiErrorTracker,
  countContains,
  createDirectNotification,
  createRoleBroadcastNotification,
  currentRole,
  ensureNotificationOpenButtonVisible,
  expectHeaderControlsDisabled,
  expectHeaderControlsEnabled,
  expectSearchFilterChipHidden,
  fetchCurrentUser,
  fetchUserByTicket,
  globalDismissById,
  labelById,
  loginAsTicket,
  notificationOpenButtonCount,
  notificationVisibleCount,
  openDirectSseWatcher,
  openNotificationsMenu,
  refreshNotificationView,
  toggleBookmarkById,
  toggleReadById,
  searchInput,
  visibleNotificationMenu,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

test.describe.serial('Notifications (admin/operator)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!featureEnabled, 'Notifications feature is not enabled');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
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
      .not.toContainText('Direct');

    await page.getByTestId(toggleReadById(created.id)).click();
    await expect(createdLabel).toHaveCount(0);

    await page.getByTestId('filter-read').click();
    await expect(createdLabel).toBeVisible();

    await page.locator('[data-testid="active-filter-chip-read-clear"]:visible').click();
    await expect(createdLabel).toHaveCount(0);
  });

  test('privileged viewer sees every broadcast target role on multi-role notifications', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const role = currentRole(testInfo.project.name);
    const { token } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-broadcast-roles-${suffix}`;
    const isAdminProject = testInfo.project.name.includes('admin');
    const roleIds = isAdminProject ? [1, 3] : [2, 3];
    const expectedRoleChips = isAdminProject ? ['admin', 'user'] : ['operator', 'user'];
    const created = await createRoleBroadcastNotification({
      page,
      token,
      label,
      text: `body-${suffix}`,
      roleIds,
    });

    await refreshNotificationView(page);
    const createdLabel = page.locator(`[data-testid="${labelById(created.id)}"]:visible`).first();
    await expect(createdLabel).toBeVisible({ timeout: 15000 });
    await createdLabel.scrollIntoViewIfNeeded();
    const anchor = createdLabel.locator('xpath=ancestor::div[contains(@class, "notification-anchor")]');
    await expect(anchor).toContainText('Role Broadcast');
    for (const roleName of expectedRoleChips) {
      await expect(anchor).toContainText(roleName);
    }
  });

  test('bookmark and globally-dismissed filters can be toggled and cleared via chips', async ({ page }, testInfo) => {
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

    await page.getByTestId(globalDismissById(created.id)).click();
    await expect(createdLabel).toHaveCount(0);
    await page.getByTestId('filter-globally-dismissed').click();
    await expect(createdLabel).toBeVisible();
    await page.locator('[data-testid="active-filter-chip-globally-dismissed-clear"]:visible').click();
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
    const menu = visibleNotificationMenu(page);
    await searchInput(page).fill(label);
    await expect(menu.getByTestId('active-filter-chip-search')).toHaveCount(1);
    await expect(menu.getByText(`Search: ${label}`)).toBeVisible();

    await menu.getByTestId('active-filter-chip-search-clear').click();
    await expect(searchInput(page)).toHaveValue('');
    await expectSearchFilterChipHidden(menu);
  });

  test('search chip stays single when refining query and clears with clear-all-filters', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-search-refine-${suffix}`;

    await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const menu = visibleNotificationMenu(page);
    const input = searchInput(page);
    await input.fill('E2E');
    await page.waitForTimeout(400);
    await expect(menu.getByTestId('active-filter-chip-search')).toHaveCount(1);
    await input.fill(label);
    await page.waitForTimeout(400);
    await expect(input).toHaveValue(label);
    await expect(menu.getByTestId('active-filter-chip-search')).toHaveCount(1);
    await expect(menu.getByText(`Search: ${label}`)).toBeVisible();

    await menu.getByTestId('clear-notification-filters').click();
    await expect(input).toHaveValue('');
    await expectSearchFilterChipHidden(menu);
  });

  test('each active filter chip appears at most once and clears individually', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-${role}-chips-dedup-${suffix}`;

    await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    const menu = visibleNotificationMenu(page);
    await menu.getByTestId('filter-read').click();
    await menu.getByTestId('filter-bookmarked').click();
    await menu.getByTestId('filter-globally-dismissed').click();
    const input = searchInput(page);
    await expect(input).toBeEnabled();
    const query = label.slice(0, 12);
    await input.click();
    await input.fill('');
    await input.pressSequentially(query);
    await expect(input).toHaveValue(query, { timeout: 10000 });
    await page.waitForTimeout(350);

    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    await expect(menu.getByTestId('active-filter-chip-bookmarked')).toHaveCount(1);
    await expect(menu.getByTestId('active-filter-chip-globally-dismissed')).toHaveCount(1);
    await expect(menu.getByTestId('active-filter-chip-search')).toHaveCount(1);

    await menu.getByTestId('active-filter-chip-search-clear').click();
    await expectSearchFilterChipHidden(menu);
    await menu.getByTestId('active-filter-chip-read-clear').click();
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
    await menu.getByTestId('active-filter-chip-bookmarked-clear').click();
    await expect(menu.getByTestId('active-filter-chip-bookmarked')).toHaveCount(0);
    await menu.getByTestId('active-filter-chip-globally-dismissed-clear').click();
    await expect(menu.getByTestId('active-filter-chip-globally-dismissed')).toHaveCount(0);
  });

  test('top control tooltips are visible with expected labels', async ({ page }) => {
    const menu = visibleNotificationMenu(page);
    const checks = [
      ['filter-unread', 'Filter Unread'],
      ['filter-read', 'Filter Read'],
      ['filter-bookmarked', 'Filter Bookmarked'],
      ['filter-globally-dismissed', 'Filter Globally Dismissed'],
      ['mark-all-read', 'Mark all as read'],
    ];
    for (const [testId, tooltip] of checks) {
      const button = menu.getByTestId(testId);
      // eslint-disable-next-line no-await-in-loop
      await expect(button).toHaveAttribute('title', tooltip);
    }
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

  test('notification visible count changes when filters change', async ({ page }, testInfo) => {
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
    const createdB = await createDirectNotification({
      page,
      token,
      userId,
      label: `${labelPrefix}-B`,
      text: 'badge body B',
    });
    const createdC = await createDirectNotification({
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
    const labelA = page.getByTestId(labelById(createdA.id));
    const labelB = page.getByTestId(labelById(createdB.id));
    const labelC = page.getByTestId(labelById(createdC.id));
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
    await expect(labelC).toBeVisible();

    await page.getByTestId('filter-bookmarked').click();
    await expect(labelA).toBeVisible();
    await expect(labelB).toHaveCount(0);
    await expect(labelC).toHaveCount(0);

    await page.getByTestId('filter-bookmarked').click();
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
    await expect(labelC).toBeVisible();
  });

  test('notification-open button badge count uses total matched for active filters', async ({ page }, testInfo) => {
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
    await page.getByTestId('filter-read').click();

    const readTotalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        read: true,
        globally_dismissed: false,
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
        globally_dismissed: false,
        limit: 1,
        offset: 0,
      },
    });
    expect(readBookmarkedTotalRes.status()).toBe(200);
    const readBookmarkedBody = await readBookmarkedTotalRes.json();
    const readBookmarkedTotal = Number(readBookmarkedBody.total || 0);
    await expect(notificationOpenButtonCount(page)).toContainText(countContains(readBookmarkedTotal));
  });

  test('active filters request first page with pagination params and total matched badge count', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const createdCount = 6;
    const createdIds = [];

    for (let i = 0; i < createdCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const created = await createDirectNotification({
        page,
        token,
        userId,
        label: `E2E-${role}-paged-filter-${suffix}-${i}`,
        text: `paged filter ${i}`,
      });
      createdIds.push(created.id);
    }

    for (const id of createdIds) {
      // eslint-disable-next-line no-await-in-loop
      await patch({
        requestContext: page.request,
        token,
        url: `/notifications/${id}/state`,
        data: { is_read: true, is_bookmarked: true },
      });
    }

    await refreshNotificationView(page);

    const requestedOffsets = [];
    const requestedLimits = [];
    const onRequest = (req) => {
      const url = req.url();
      if (!/\/notifications\?/.test(url)) return;
      const parsed = new URL(url);
      const read = parsed.searchParams.get('read');
      const bookmarked = parsed.searchParams.get('bookmarked');
      const offset = parsed.searchParams.get('offset');
      const limit = parsed.searchParams.get('limit');
      if (read === 'true' && bookmarked === 'true') {
        requestedOffsets.push(Number(offset || 0));
        requestedLimits.push(Number(limit || 0));
      }
    };
    page.on('request', onRequest);

    await page.getByTestId('filter-read').click();
    await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(1);
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.locator('[data-testid="active-filter-chip-bookmarked"]:visible')).toHaveCount(1);

    const totalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        read: true,
        bookmarked: true,
        globally_dismissed: false,
        limit: 1,
        offset: 0,
      },
    });
    expect(totalRes.status()).toBe(200);
    const totalBody = await totalRes.json();
    const expectedTotal = Number(totalBody.total || 0);
    expect(expectedTotal).toBeGreaterThanOrEqual(createdCount);
    const expectedVisible = Math.min(20, expectedTotal);

    await expect(notificationOpenButtonCount(page)).toContainText(countContains(expectedTotal));
    await expect(notificationVisibleCount(page)).toContainText(countContains(expectedVisible));
    page.off('request', onRequest);

    expect(requestedOffsets).toContain(0);
    expect(requestedLimits).toContain(20);
  });

  test('search + active filters use paginated API results and total matched visible count', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const labelPrefix = `E2E-${role}-paged-search-filter-${suffix}`;
    const createdCount = 21;
    const createdIds = [];

    for (let i = 0; i < createdCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const created = await createDirectNotification({
        page,
        token,
        userId,
        label: `${labelPrefix}-${i}`,
        text: `paged search filter ${i}`,
      });
      createdIds.push(created.id);
    }

    for (const id of createdIds) {
      // eslint-disable-next-line no-await-in-loop
      await patch({
        requestContext: page.request,
        token,
        url: `/notifications/${id}/state`,
        data: { is_read: true, is_bookmarked: true },
      });
    }

    await refreshNotificationView(page);
    const menuPanel = page.locator('[data-testid="notification-menu-items"]:visible').first();
    const scopedReadFilter = menuPanel.locator('[data-testid="filter-read"]').first();
    const scopedBookmarkedFilter = menuPanel.locator('[data-testid="filter-bookmarked"]').first();
    const scopedSearchInput = menuPanel.getByPlaceholder('Search notifications').first();

    await scopedReadFilter.click();
    await scopedBookmarkedFilter.click();
    await expect(scopedSearchInput).toBeVisible();
    await expect(scopedSearchInput).toBeEnabled();
    await scopedSearchInput.click();
    const searchListRequest = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/api/notifications') &&
        r.url().includes(encodeURIComponent(labelPrefix)),
      { timeout: 15000 },
    );
    await scopedSearchInput.fill(labelPrefix);
    await expect(scopedSearchInput).toHaveValue(labelPrefix, { timeout: 10000 });
    await searchListRequest;

    const totalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        read: true,
        bookmarked: true,
        globally_dismissed: false,
        search: labelPrefix,
        limit: 1,
        offset: 0,
      },
    });
    expect(totalRes.status()).toBe(200);
    const totalBody = await totalRes.json();
    const expectedTotal = Number(totalBody.total || 0);
    expect(expectedTotal).toBeGreaterThanOrEqual(createdCount);

    let secondPageId = null;
    if (expectedTotal > 20) {
      const secondPageRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          read: true,
          bookmarked: true,
          globally_dismissed: false,
          search: labelPrefix,
          limit: 20,
          offset: 20,
        },
      });
      expect(secondPageRes.status()).toBe(200);
      const secondPageBody = await secondPageRes.json();
      expect(secondPageBody.items.length).toBeGreaterThan(0);
      secondPageId = secondPageBody.items[0].id;
      const secondPageLabel = menuPanel.locator(`[data-testid="${labelById(secondPageId)}"]`).first();
      await expect(secondPageLabel).toHaveCount(0);

      const appendRequest = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          r.url().includes('/api/notifications') &&
          r.url().includes('offset=20'),
        { timeout: 15000 },
      );
      await page.getByTestId('notification-menu-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await appendRequest;
      await expect(notificationVisibleCount(page)).toContainText(
        countContains(expectedTotal),
      );
    } else {
      await page.getByTestId('notification-menu-scroll').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  test('header controls are disabled while notification list fetch is in flight', async ({ page }, testInfo) => {
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
      await page.waitForTimeout(400);
      await route.continue();
    });

    await page.getByTestId('filter-read').click();
    await page.waitForTimeout(120);
    await expectHeaderControlsDisabled(page);
    await page.waitForTimeout(350);
    await expectHeaderControlsEnabled(page);
    await page.unroute(delayedReadFilterRequest);
  });

  test('controls are disabled while toggle-read mutation is in flight', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-toggle-read-${suffix}`,
      text: `loading state toggle-read ${suffix}`,
    });
    await refreshNotificationView(page);

    const delayedToggleReadRequest = new RegExp(`/api/notifications/${created.id}/state$`);
    await page.route(delayedToggleReadRequest, async (route) => {
      await page.waitForTimeout(400);
      await route.continue();
    });

    await page.getByTestId(toggleReadById(created.id)).click();
    await expectHeaderControlsDisabled(page);
    await expectHeaderControlsEnabled(page);
    await page.unroute(delayedToggleReadRequest);
  });

  test('controls are disabled while mark-all-read mutation is in flight', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-mark-all-${suffix}`,
      text: `loading state mark-all-read ${suffix}`,
    });
    await refreshNotificationView(page);

    const delayedMarkAllRequest = /\/api\/notifications\/mark-all-read$/;
    await page.route(delayedMarkAllRequest, async (route) => {
      await page.waitForTimeout(400);
      await route.continue();
    });

    await page.getByTestId('mark-all-read').click();
    await expectHeaderControlsDisabled(page);
    await expectHeaderControlsEnabled(page);
    await page.unroute(delayedMarkAllRequest);
  });

  test('controls are disabled while global-dismiss mutation is in flight', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-global-dismiss-${suffix}`,
      text: `loading state global-dismiss ${suffix}`,
    });
    await refreshNotificationView(page);

    const delayedGlobalDismissRequest = new RegExp(`/api/notifications/${created.id}/global-dismiss$`);
    await page.route(delayedGlobalDismissRequest, async (route) => {
      await page.waitForTimeout(400);
      await route.continue();
    });

    await page.getByTestId(globalDismissById(created.id)).click();
    await expectHeaderControlsDisabled(page);
    await expectHeaderControlsEnabled(page);
    await page.unroute(delayedGlobalDismissRequest);
  });

  test('list fetch disables top controls, search input, and per-row actions', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-categories-${suffix}`,
      text: `loading categories ${suffix}`,
    });
    await refreshNotificationView(page);
    const menu = visibleNotificationMenu(page);

    const delayedListRequest = /\/api\/notifications\?/;
    await page.route(delayedListRequest, async (route) => {
      await page.waitForTimeout(450);
      await route.continue();
    });

    // Phase 1: row controls + top controls + search.
    await menu.getByTestId('filter-read').click();
    await expectHeaderControlsDisabled(page);
    await expect(menu.getByTestId(toggleReadById(created.id))).toBeDisabled();
    await expect(menu.getByTestId(toggleBookmarkById(created.id))).toBeDisabled();
    await expect(menu.getByTestId(globalDismissById(created.id))).toBeDisabled();
    await expectHeaderControlsEnabled(page);

    await page.unroute(delayedListRequest);
  });

  test('search chip clear is disabled while notification list fetch is in flight', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-loading-search-clear-${suffix}`,
      text: `loading search chip clear ${suffix}`,
    });
    await refreshNotificationView(page);
    const menu = visibleNotificationMenu(page);
    const input = searchInput(page);
    await input.focus();
    await input.fill(`search-clear-${suffix}`);
    await expect(menu.getByTestId('active-filter-chip-search-clear')).toBeVisible({ timeout: 15000 });

    const delayedListRequest = /\/api\/notifications\?.*read=true/;
    await page.route(delayedListRequest, async (route) => {
      await page.waitForTimeout(450);
      await route.continue();
    });

    await menu.getByTestId('filter-read').click();
    await expect(menu.getByTestId('active-filter-chip-search-clear')).toBeDisabled();
    await expect(menu.getByTestId('active-filter-chip-search-clear')).toBeEnabled();

    await page.unroute(delayedListRequest);
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

  test('globally dismissed chip clears reliably with no duplicates', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-globally-dismissed-chip-${suffix}`,
      text: `Body for globally dismissed chip ${suffix}`,
    });
    await refreshNotificationView(page);

    await page.getByTestId(globalDismissById(created.id)).click();
    await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);

    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('filter-globally-dismissed').click();
      await expect(page.getByTestId(labelById(created.id))).toBeVisible();
      await expect(page.locator('[data-testid="active-filter-chip-globally-dismissed"]:visible')).toHaveCount(1);
      await page.locator('[data-testid="active-filter-chip-globally-dismissed-clear"]:visible').click();
      await expect(page.locator('[data-testid="active-filter-chip-globally-dismissed"]:visible')).toHaveCount(0);
      await expect(page.getByTestId(labelById(created.id))).toHaveCount(0);
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

    await page.getByTestId('filter-bookmarked').click();
    await expect(page.locator('[data-testid="active-filter-chip-bookmarked"]:visible')).toHaveCount(1);

    await page.locator('[data-testid="active-filter-chip-read-clear"]:visible').click();
    await expect(page.locator('[data-testid="active-filter-chip-read"]:visible')).toHaveCount(0);

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

  test('read+bookmarked and unread+bookmarked filters keep intersection only', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const comboA = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RB-UB-A-${suffix}`,
      text: 'intersection combo A',
    });
    const comboB = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RB-UB-B-${suffix}`,
      text: 'intersection combo B',
    });
    const comboC = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RB-UB-C-${suffix}`,
      text: 'intersection combo C',
    });

    // A/C: read + bookmarked, B: unread + bookmarked.
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboA.id}/state`,
      data: { is_read: true, is_bookmarked: true },
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboB.id}/state`,
      data: { is_read: false, is_bookmarked: true },
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboC.id}/state`,
      data: { is_read: true, is_bookmarked: true },
    });

    await refreshNotificationView(page);

    // read + bookmarked => A and C only.
    await page.getByTestId('filter-read').click();
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.getByTestId(labelById(comboA.id))).toBeVisible();
    await expect(page.getByTestId(labelById(comboC.id))).toBeVisible();
    await expect(page.getByTestId(labelById(comboB.id))).toHaveCount(0);

    await page.getByTestId('clear-notification-filters').click();

    // unread + bookmarked => B only.
    await page.getByTestId('filter-unread').click();
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.getByTestId(labelById(comboA.id))).toHaveCount(0);
    await expect(page.getByTestId(labelById(comboB.id))).toBeVisible();
    await expect(page.getByTestId(labelById(comboC.id))).toHaveCount(0);
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
    const menu = visibleNotificationMenu(page);
    await searchInput(page).fill(label);
    await menu.getByTestId('filter-bookmarked').click();
    await expect(menu.getByText(`Search: ${label}`)).toBeVisible();
    await expect(menu.getByTestId('clear-notification-filters')).toBeVisible();

    await menu.getByTestId('clear-notification-filters').click();
    await expect(searchInput(page)).toHaveValue('');
    await expectSearchFilterChipHidden(menu);
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
    await expect(page.getByTestId(labelById(created.id))).toBeVisible({ timeout: 6000 });
  });

  test('state update after global dismiss shows conflict toast', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Race condition toast test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-race-dismiss-state-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    await refreshNotificationView(page);
    await expect(page.getByTestId(labelById(created.id))).toBeVisible();

    const dismissRes = await page.request.patch(`${config.apiBaseURL}/notifications/${created.id}/global-dismiss`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dismissRes.status()).toBe(200);

    await page.getByTestId(toggleReadById(created.id)).click();

    const toastMessage = page.locator('.va-toast__group').getByText('globally dismissed', { exact: false });
    await expect(toastMessage).toBeVisible({ timeout: 6000 });
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
      text: `Link warning test`,
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
      text: `Trusted link test`,
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

  test('add recipients to dismissed notification shows conflict via API', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    test.skip(role !== 'admin', 'Recipient conflict test runs once under admin project');
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);
    const label = `E2E-race-dismiss-recipient-${suffix}`;

    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `Body for ${label}`,
    });

    const dismissRes = await page.request.patch(`${config.apiBaseURL}/notifications/${created.id}/global-dismiss`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dismissRes.status()).toBe(200);

    const addRecipientRes = await post({
      requestContext: page.request,
      token,
      url: `/notifications/${created.id}/recipients`,
      data: { user_ids: [userId] },
    });
    expect(addRecipientRes.status()).toBe(409);
    const body = await addRecipientRes.json();
    expect(body.code).toBe('NOTIFICATION_GLOBALLY_DISMISSED');
  });
});
