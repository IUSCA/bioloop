const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  createDirectNotification,
  ensureNotificationOpenButtonVisible,
  fetchCurrentUser,
  labelById,
  locatorContainsActiveElement,
  openNotificationsMenu,
  searchInput,
  visibleNotificationMenu,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

async function isolateNotificationRow(page, labelText) {
  const menu = visibleNotificationMenu(page);
  const input = menu.getByPlaceholder('Search notifications').first();
  await input.fill(labelText);
  await page.waitForTimeout(500);
  await input.focus();
  await page.waitForTimeout(80);
}

async function tabUntilLocatorFocused(page, locator, { maxTabs = 14 } = {}) {
  for (let i = 0; i < maxTabs; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await locatorContainsActiveElement(locator)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab');
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(45);
  }
  expect(await locatorContainsActiveElement(locator)).toBe(true);
}

async function shiftTabUntilLocatorFocused(page, locator, { maxTabs = 14 } = {}) {
  for (let i = 0; i < maxTabs; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await locatorContainsActiveElement(locator)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Shift+Tab');
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(45);
  }
  expect(await locatorContainsActiveElement(locator)).toBe(true);
}

async function expectActiveTestId(page, testId) {
  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const el = document.activeElement;
        const host = el?.closest('[data-testid]');
        return host?.getAttribute('data-testid') || '';
      }, testId),
    )
    .toBe(testId);
}

test.describe('Notification keyboard accessibility', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('Enter on notification-open button opens menu and focuses a top control', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);

    await page.getByTestId('notification-open-button').press('Enter');
    const menu = visibleNotificationMenu(page);
    await expect(menu).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => {
        const tid = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.closest('[data-testid]')?.getAttribute('data-testid') || '';
        });
        return [
          'filter-unread',
          'filter-read',
          'filter-archived',
          'filter-bookmarked',
          'filter-globally-dismissed',
          'mark-all-read',
        ].includes(tid);
      }, { timeout: 12000 })
      .toBeTruthy();
  });

  test('forward Tab reaches notification links before mark read', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = `${Date.now()}`;
    const label = `E2E-kbd-link-${suffix}`;
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `body-${suffix}`,
      metadata: {
        links: [
          {
            id: 'e2e-a',
            label: 'E2E link A',
            href: '/profile',
            trusted: true,
            open_in_new_tab: false,
          },
          {
            id: 'e2e-b',
            label: 'E2E link B',
            href: '/about',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    await page.waitForTimeout(400);
    await isolateNotificationRow(page, label);

    const menu = visibleNotificationMenu(page);
    const scopedSearch = menu.getByPlaceholder('Search notifications').first();
    expect(await locatorContainsActiveElement(scopedSearch)).toBe(true);
    const linkA = menu.getByTestId(`notification-${created.id}-link-e2e-a`);
    const linkB = menu.getByTestId(`notification-${created.id}-link-e2e-b`);
    const markRead = menu.getByTestId(`notification-${created.id}-toggle-read`);

    await tabUntilLocatorFocused(page, linkA);
    await page.keyboard.press('Tab');
    expect(await locatorContainsActiveElement(linkB)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await locatorContainsActiveElement(markRead)).toBe(true);
  });

  test('Shift+Tab from mark read reaches links in reverse before search', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = `${Date.now()}-rev`;
    const label = `E2E-kbd-rev-${suffix}`;
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `body-${suffix}`,
      metadata: {
        links: [
          {
            id: 'r1',
            label: 'E2E reverse one',
            href: '/profile',
            trusted: true,
            open_in_new_tab: false,
          },
          {
            id: 'r2',
            label: 'E2E reverse two',
            href: '/about',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    await page.waitForTimeout(400);
    await isolateNotificationRow(page, label);

    const menu = visibleNotificationMenu(page);
    const markRead = menu.getByTestId(`notification-${created.id}-toggle-read`);
    await markRead.focus();
    await page.waitForTimeout(80);

    await page.keyboard.press('Shift+Tab');
    expect(await locatorContainsActiveElement(menu.getByTestId(`notification-${created.id}-link-r2`))).toBe(true);

    await page.keyboard.press('Shift+Tab');
    expect(await locatorContainsActiveElement(menu.getByTestId(`notification-${created.id}-link-r1`))).toBe(true);

    const scopedSearch = menu.getByPlaceholder('Search notifications').first();
    await shiftTabUntilLocatorFocused(page, scopedSearch);
    expect(await locatorContainsActiveElement(scopedSearch)).toBe(true);
  });

  test('Enter and Space activate top filter toggle buttons', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    const readBtn = menu.getByTestId('filter-read');
    await readBtn.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    await readBtn.focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
  });

  test('Enter and Space activate clear-all-filters when focused', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await menu.getByTestId('filter-read').click();
    await expect(menu.getByTestId('clear-notification-filters')).toBeVisible();
    await menu.getByTestId('clear-notification-filters').focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
    await expect(menu.getByTestId('clear-notification-filters')).toHaveCount(0);

    await menu.getByTestId('filter-archived').click();
    await expect(menu.getByTestId('active-filter-chip-archived')).toHaveCount(1);
    await menu.getByTestId('clear-notification-filters').focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId('active-filter-chip-archived')).toHaveCount(0);
  });

  test('Enter and Space on unread filter clear read chip when read filter is active', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await menu.getByTestId('filter-read').click();
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    const unreadBtn = menu.getByTestId('filter-unread');
    await unreadBtn.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);

    await menu.getByTestId('filter-read').click();
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    await unreadBtn.focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
  });

  test('Enter and Space toggle archived, bookmarked, and globally-dismissed filter chips', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    const cases = [
      ['filter-archived', 'active-filter-chip-archived'],
      ['filter-bookmarked', 'active-filter-chip-bookmarked'],
      ['filter-globally-dismissed', 'active-filter-chip-globally-dismissed'],
    ];
    for (const [filterTestId, chipTestId] of cases) {
      const btn = menu.getByTestId(filterTestId);
      // eslint-disable-next-line no-await-in-loop
      await btn.focus();
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Enter');
      // eslint-disable-next-line no-await-in-loop
      await expect(menu.getByTestId(chipTestId)).toHaveCount(1);
      // eslint-disable-next-line no-await-in-loop
      await btn.focus();
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Space');
      // eslint-disable-next-line no-await-in-loop
      await expect(menu.getByTestId(chipTestId)).toHaveCount(0);
    }
  });

  test('Shift+Tab from search reaches chip clears before clear-all-filters', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await menu.getByTestId('filter-read').click();
    const input = searchInput(page);
    await input.fill('kbd-chip-order');
    await page.waitForTimeout(350);
    await input.focus();

    const visited = [];
    for (let i = 0; i < 32; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const tid = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[data-testid]')?.getAttribute('data-testid') || '';
      });
      visited.push(tid);
      if (tid === 'clear-notification-filters') {
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Shift+Tab');
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(45);
    }

    const clearAllIdx = visited.indexOf('clear-notification-filters');
    expect(clearAllIdx).toBeGreaterThan(-1);
    const firstChipIdx = visited.findIndex((tid) => tid.startsWith('active-filter-chip-') && tid.endsWith('-clear'));
    expect(firstChipIdx).toBeGreaterThan(-1);
    expect(firstChipIdx).toBeLessThan(clearAllIdx);
  });

  test('Enter and Space on mark-all-read marks every visible row as read', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = `${Date.now()}-mark-all-kbd`;
    const createdA = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-mark-all-A-${suffix}`,
      text: 'body a',
    });
    const createdB = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-mark-all-B-${suffix}`,
      text: 'body b',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    let menu = visibleNotificationMenu(page);
    await expect(menu.getByTestId(labelById(createdA.id))).toBeVisible();
    await expect(menu.getByTestId(labelById(createdB.id))).toBeVisible();

    const markAll = menu.getByTestId('mark-all-read');
    await markAll.scrollIntoViewIfNeeded();
    await markAll.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId(labelById(createdA.id))).toHaveCount(0, { timeout: 15000 });
    await expect(menu.getByTestId(labelById(createdB.id))).toHaveCount(0, { timeout: 15000 });

    const suffix2 = `${Date.now()}-mark-all-space`;
    const createdC = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-mark-all-C-${suffix2}`,
      text: 'body c',
    });
    const createdD = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-mark-all-D-${suffix2}`,
      text: 'body d',
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    menu = visibleNotificationMenu(page);
    await expect(menu.getByTestId(labelById(createdC.id))).toBeVisible();
    await expect(menu.getByTestId(labelById(createdD.id))).toBeVisible();
    const markAll2 = menu.getByTestId('mark-all-read');
    await markAll2.scrollIntoViewIfNeeded();
    await markAll2.focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId(labelById(createdC.id))).toHaveCount(0, { timeout: 15000 });
    await expect(menu.getByTestId(labelById(createdD.id))).toHaveCount(0, { timeout: 15000 });
  });

  test('Enter on bookmark, archive, and global-dismiss applies per-notification actions', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const { token, userId } = await fetchCurrentUser({ page });
    const t = Date.now();
    const bookmarked = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-bm-${t}`,
      text: 'bookmark target',
    });
    const archived = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-ar-${t}`,
      text: 'archive target',
    });
    const dismissed = await createDirectNotification({
      page,
      token,
      userId,
      label: `E2E-kbd-gd-${t}`,
      text: 'dismiss target',
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);

    const dismissBtn = menu.getByTestId(`notification-${dismissed.id}-global-dismiss`);
    await dismissBtn.scrollIntoViewIfNeeded();
    await dismissBtn.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId(labelById(dismissed.id))).toHaveCount(0, { timeout: 15000 });

    const bookmarkBtn = menu.getByTestId(`notification-${bookmarked.id}-toggle-bookmark`);
    await bookmarkBtn.scrollIntoViewIfNeeded();
    await bookmarkBtn.focus();
    await page.keyboard.press('Enter');
    await menu.getByTestId('filter-bookmarked').click();
    await expect(menu.getByTestId(labelById(bookmarked.id))).toBeVisible();
    await menu.getByTestId('filter-bookmarked').click();

    const archiveBtn = menu.getByTestId(`notification-${archived.id}-toggle-archive`);
    await archiveBtn.scrollIntoViewIfNeeded();
    await archiveBtn.focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId(labelById(archived.id))).toHaveCount(0);
    await menu.getByTestId('filter-archived').click();
    await expect(menu.getByTestId(labelById(archived.id))).toBeVisible();
  });

  test('Enter on per-notification state buttons toggles state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const { token, userId } = await fetchCurrentUser({ page });
    const suffix = `${Date.now()}-enter-row`;
    const label = `E2E-kbd-enter-${suffix}`;
    const created = await createDirectNotification({
      page,
      token,
      userId,
      label,
      text: `body-${suffix}`,
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await expect(menu.getByTestId(labelById(created.id))).toBeVisible();

    const markRead = menu.getByTestId(`notification-${created.id}-toggle-read`);
    await markRead.focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId(labelById(created.id))).toHaveCount(0);

    await menu.getByTestId('filter-read').click();
    await expect(menu.getByTestId(labelById(created.id))).toBeVisible();
    const markReadAgain = menu.getByTestId(`notification-${created.id}-toggle-read`);
    await markReadAgain.focus();
    await page.keyboard.press('Space');
    await expect(menu.getByTestId(labelById(created.id))).toHaveCount(0);
  });
});
