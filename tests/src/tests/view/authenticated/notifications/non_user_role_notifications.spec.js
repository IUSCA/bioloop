const { randomUUID } = require('node:crypto');
const { test, expect } = require('@playwright/test');
const config = require('config');
const { post, patch } = require('../../../../api');
const {
  attachUiErrorTracker,
  countContains,
  createDirectNotification,
  currentRole,
  ensureNotificationOpenButtonVisible,
  expectHeaderControlsDisabled,
  expectHeaderControlsEnabled,
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
  toggleArchiveById,
  toggleBookmarkById,
  toggleReadById,
  searchInput,
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
    await searchInput(page).fill(label);
    await expect(page.getByText(`Search: ${label}`)).toBeVisible();

    const searchChipClear = page.locator('[data-testid="active-filter-chip-search-clear"]:visible').first();
    await expect(searchChipClear).toBeVisible();
    await searchChipClear.click({ force: true });
    await expect(searchInput(page)).toHaveValue('');
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
        archived: false,
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
        archived: false,
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
        archived: false,
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
    const scopedSearchInput = menuPanel.locator('input[data-testid="notification-search"]').first();

    await scopedReadFilter.click();
    await scopedBookmarkedFilter.click();
    await expect(scopedSearchInput).toBeVisible();
    await expect(scopedSearchInput).toBeEnabled();
    await scopedSearchInput.click();
    await page.keyboard.type(labelPrefix);
    await expect(menuPanel.locator('[data-testid="active-filter-chip-search"]')).toHaveCount(1);

    const totalRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        read: true,
        archived: false,
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

    let secondPageLabel = null;
    if (expectedTotal > 20) {
      const secondPageRes = await page.request.get(`${config.apiBaseURL}/notifications`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          read: true,
          archived: false,
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
      const secondPageId = secondPageBody.items[0].id;
      secondPageLabel = menuPanel.locator(`[data-testid="${labelById(secondPageId)}"]`).first();
      await expect(secondPageLabel).toHaveCount(0);
    }

    await menuPanel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    if (secondPageLabel) {
      await expect(secondPageLabel).toBeVisible();
    }
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
      await page.waitForTimeout(400);
      await route.continue();
    });

    await page.getByTestId('filter-read').click();
    await expectHeaderControlsDisabled(page);
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

  test('read+archived and archived+bookmarked filters keep intersection only', async ({ page }, testInfo) => {
    const role = currentRole(testInfo.project.name);
    const { token, userId } = await fetchCurrentUser({ page, role });
    const suffix = randomUUID().slice(0, 8);

    const comboA = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RA-AB-A-${suffix}`,
      text: 'intersection combo A',
    });
    const comboB = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RA-AB-B-${suffix}`,
      text: 'intersection combo B',
    });
    const comboC = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-${role}-intersection-RA-AB-C-${suffix}`,
      text: 'intersection combo C',
    });

    // A/C: read + archived, B: archived + bookmarked (and unread).
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboA.id}/state`,
      data: { is_read: true, is_archived: true, is_bookmarked: false },
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboB.id}/state`,
      data: { is_read: false, is_archived: true, is_bookmarked: true },
    });
    await patch({
      requestContext: page.request,
      token,
      url: `/notifications/${comboC.id}/state`,
      data: { is_read: true, is_archived: true, is_bookmarked: false },
    });

    await refreshNotificationView(page);

    // read + archived => A and C only.
    await page.getByTestId('filter-read').click();
    await page.getByTestId('filter-archived').click();
    await expect(page.getByTestId(labelById(comboA.id))).toBeVisible();
    await expect(page.getByTestId(labelById(comboC.id))).toBeVisible();
    await expect(page.getByTestId(labelById(comboB.id))).toHaveCount(0);

    await page.getByTestId('clear-notification-filters').click();

    // archived + bookmarked => B only.
    await page.getByTestId('filter-archived').click();
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
    await searchInput(page).fill(label);
    await page.getByTestId('filter-bookmarked').click();
    await expect(page.getByText(`Search: ${label}`)).toBeVisible();
    await expect(page.getByTestId('clear-notification-filters')).toBeVisible();

    await page.getByTestId('clear-notification-filters').click();
    await expect(searchInput(page)).toHaveValue('');
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

    const modal = page.locator('.va-modal').getByText('Untrusted Link', { exact: false });
    await expect(modal).toBeVisible({ timeout: 3000 });

    const modalBody = page.locator('.va-modal').getByText('untrusted link', { exact: false });
    await expect(modalBody).toBeVisible();

    await page.locator('.va-modal').getByText('Cancel').click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
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
