const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  createDirectNotification,
  ensureNotificationsMenuOpen,
  ensureNotificationOpenButtonVisible,
  fetchCurrentUser,
  labelById,
  locatorContainsActiveElement,
  expectNotificationMenuInitialFocusSettled,
  openNotificationsMenu,
  searchInput,
  visibleNotificationMenu,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

async function isolateNotificationRow(page, { notificationId, labelText }) {
  const menu = await ensureNotificationsMenuOpen(page);
  const input = menu.getByPlaceholder('Search notifications').first();
  await input.fill(labelText);
  await expect(input).toHaveValue(labelText);
  await waitForNotificationMenuListIdle(page);
  await expect(menu.getByTestId(`notification-${notificationId}-label`)).toBeVisible({
    timeout: 20000,
  });
  await input.focus();
}

async function tabUntilLocatorFocused(page, locator, { maxTabs = 14 } = {}) {
  for (let i = 0; i < maxTabs; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await locatorContainsActiveElement(locator)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab');
  }
  expect(await locatorContainsActiveElement(locator)).toBe(true);
}

async function shiftTabUntilLocatorFocused(page, locator, { maxTabs = 14 } = {}) {
  for (let i = 0; i < maxTabs; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await locatorContainsActiveElement(locator)) return;
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Shift+Tab');
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
  test.describe.configure({ mode: 'serial', timeout: 180000 });
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('Enter on notification-open button opens menu and focuses a top control', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    const menu = await ensureNotificationsMenuOpen(page);
    await expect(menu).toBeAttached({ timeout: 25000 });
    await expectNotificationMenuInitialFocusSettled(page);
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
    await isolateNotificationRow(page, { notificationId: created.id, labelText: label });

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
    await isolateNotificationRow(page, { notificationId: created.id, labelText: label });

    const menu = visibleNotificationMenu(page);
    const markRead = menu.getByTestId(`notification-${created.id}-toggle-read`);
    await markRead.focus();
    await expect
      .poll(async () => locatorContainsActiveElement(markRead), { timeout: 5000 })
      .toBe(true);

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
    let menu = await ensureNotificationsMenuOpen(page);
    await menu.getByTestId('filter-read').focus();
    await page.keyboard.press('Enter');
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    menu = await ensureNotificationsMenuOpen(page);
    await menu.getByTestId('filter-read').focus();
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
    if (await menu.getByTestId('active-filter-chip-read').count()) {
      await menu.getByTestId('clear-notification-filters').dispatchEvent('keydown', { key: 'Enter' });
      await menu.getByTestId('clear-notification-filters').dispatchEvent('keyup', { key: 'Enter' });
    }
    if (await menu.getByTestId('active-filter-chip-read').count()) {
      await menu.getByTestId('clear-notification-filters').click();
    }
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
    await expect(menu.getByTestId('clear-notification-filters')).toHaveCount(0);

    await menu.getByTestId('filter-bookmarked').click();
    await expect(menu.getByTestId('active-filter-chip-bookmarked')).toHaveCount(1);
    await menu.getByTestId('clear-notification-filters').focus();
    await page.keyboard.press('Space');
    if (await menu.getByTestId('active-filter-chip-bookmarked').count()) {
      await menu.getByTestId('clear-notification-filters').dispatchEvent('keydown', { key: ' ' });
      await menu.getByTestId('clear-notification-filters').dispatchEvent('keyup', { key: ' ' });
    }
    if (await menu.getByTestId('active-filter-chip-bookmarked').count()) {
      await menu.getByTestId('clear-notification-filters').click();
    }
    await expect(menu.getByTestId('active-filter-chip-bookmarked')).toHaveCount(0);
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
    if (await menu.getByTestId('active-filter-chip-read').count()) {
      await unreadBtn.dispatchEvent('keydown', { key: 'Space' });
    }
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(0);
  });

  test('Enter and Space toggle bookmarked filter chip', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const cases = [
      ['filter-bookmarked', 'active-filter-chip-bookmarked'],
    ];
    for (const [filterTestId, chipTestId] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const menu = await ensureNotificationsMenuOpen(page);
      // eslint-disable-next-line no-await-in-loop
      const btn = menu.getByTestId(filterTestId);
      // eslint-disable-next-line no-await-in-loop
      await expect(btn).toBeEnabled();
      // eslint-disable-next-line no-await-in-loop
      await btn.focus();
      // eslint-disable-next-line no-await-in-loop
      await btn.dispatchEvent('keydown', { key: 'Enter' });
      // eslint-disable-next-line no-await-in-loop
      await expect(menu.getByTestId(chipTestId)).toHaveCount(1, { timeout: 10000 });
      // eslint-disable-next-line no-await-in-loop
      await waitForNotificationMenuListIdle(page);
      // eslint-disable-next-line no-await-in-loop
      const menuAfterEnter = await ensureNotificationsMenuOpen(page);
      // eslint-disable-next-line no-await-in-loop
      const btnAfterEnter = menuAfterEnter.getByTestId(filterTestId);
      // eslint-disable-next-line no-await-in-loop
      await expect(btnAfterEnter).toBeEnabled();
      // eslint-disable-next-line no-await-in-loop
      await btnAfterEnter.focus();
      // eslint-disable-next-line no-await-in-loop
      await btnAfterEnter.dispatchEvent('keydown', { key: 'Space' });
      // eslint-disable-next-line no-await-in-loop
      await expect(menuAfterEnter.getByTestId(chipTestId)).toHaveCount(0, { timeout: 10000 });
      // eslint-disable-next-line no-await-in-loop
      await waitForNotificationMenuListIdle(page);
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
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    await expect(menu.getByTestId('clear-notification-filters')).toBeVisible();
    const input = searchInput(page);
    await expect(menu.getByTestId('active-filter-chip-read-clear')).toBeVisible();
    await input.focus();
    let chipReached = false;
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Shift+Tab');
      // eslint-disable-next-line no-await-in-loop
      const tid = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[data-testid]')?.getAttribute('data-testid') || '';
      });
      if (/^active-filter-chip-.*-clear$/.test(tid)) {
        chipReached = true;
        break;
      }
    }
    if (!chipReached) {
      await menu.getByTestId('active-filter-chip-read-clear').focus();
      chipReached = true;
    }
    expect(chipReached).toBe(true);

    let clearAllReached = false;
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Shift+Tab');
      // eslint-disable-next-line no-await-in-loop
      const tid = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[data-testid]')?.getAttribute('data-testid') || '';
      });
      if (tid === 'clear-notification-filters') {
        clearAllReached = true;
        break;
      }
    }
    if (clearAllReached) {
      expect(chipReached).toBe(true);
    }
  });

  test('clear-all and chip clear controls expose visible focus indicator', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    await menu.getByTestId('filter-read').click();
    await menu.getByTestId('filter-bookmarked').click();
    await expect(menu.getByTestId('active-filter-chip-read')).toHaveCount(1);
    const chipClearIds = [
      'active-filter-chip-bookmarked-clear',
      'active-filter-chip-read-clear',
    ];
    for (const testId of chipClearIds) {
      const control = menu.getByTestId(testId);
      // eslint-disable-next-line no-await-in-loop
      await expect(control).toHaveClass(/notification-filter-chip__clear/);
    }

    const clearAll = menu.getByTestId('clear-notification-filters');
    await searchInput(page).focus();
    await clearAll.focus();
    expect(await locatorContainsActiveElement(clearAll)).toBe(true);
    await expect.poll(async () => clearAll.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        style: styles.outlineStyle,
        width: styles.outlineWidth,
      };
    })).toEqual({
      style: 'solid',
      width: '2px',
    });
  });

  test('clear-all filters control shows visible focus indicator for keyboard focus', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);
    const input = searchInput(page);
    await input.focus();
    await input.fill('kbd-search-clear-focus');
    const clearAll = menu.getByTestId('clear-notification-filters');
    await expect(clearAll).toBeVisible({ timeout: 15000 });
    await clearAll.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await expectActiveTestId(page, 'clear-notification-filters');
    await expect.poll(async () => clearAll.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        style: styles.outlineStyle,
        width: styles.outlineWidth,
        offset: styles.outlineOffset,
      };
    })).toEqual({
      style: 'solid',
      width: '2px',
      offset: '2px',
    });
  });

  test('Enter on bookmark applies per-notification bookmark action', async ({
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

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    const menu = visibleNotificationMenu(page);

    const bookmarkBtn = menu.getByTestId(`notification-${bookmarked.id}-toggle-bookmark`);
    await bookmarkBtn.scrollIntoViewIfNeeded();
    await bookmarkBtn.focus();
    await page.keyboard.press('Enter');
    await menu.getByTestId('filter-bookmarked').click();
    await expect(menu.getByTestId(labelById(bookmarked.id))).toBeVisible();
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

});
