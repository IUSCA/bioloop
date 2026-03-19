const { test, expect } = require('@playwright/test');
const config = require('config');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

// Reliable helpers for the teleported notification menu.
const openNotificationsMenu = async (page) => {
  const menu = page.getByTestId('notification-menu-items');
  for (let i = 0; i < 3; i += 1) {
    if (await menu.isVisible()) return;
    await page.getByTestId('notification-open-button').click();
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);
  }
  await expect(menu).toBeVisible();
};

const ensureNotificationOpenButtonVisible = async (page) => {
  const notificationOpenButton = page.getByTestId('notification-open-button');
  for (let i = 0; i < 3; i += 1) {
    if (await notificationOpenButton.isVisible()) return;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(500);
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect(notificationOpenButton).toBeVisible();
};

// Resolve data-testid of the currently focused element (or its closest
// ancestor with one).
const activeTestId = (page) =>
  page.evaluate(
    () =>
      document.activeElement?.getAttribute?.('data-testid')
      || document.activeElement?.closest?.('[data-testid]')?.getAttribute?.('data-testid')
      || document.activeElement?.tagName,
  );

// Expected forward-Tab order inside the notification menu header.
const TOP_CONTROL_ORDER = [
  'filter-unread',
  'filter-read',
  'filter-archived',
  'filter-bookmarked',
  'filter-globally-dismissed',
  'mark-all-read',
];

test.describe('Notification keyboard accessibility', () => {
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('Enter on notification-open button opens menu and focuses first control', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);

    await page.getByTestId('notification-open-button').press('Enter');
    // The retry-focus loop needs time to settle over Vuestic's own focus grab.
    await expect(page.getByTestId('notification-menu-items')).toBeVisible({ timeout: 3000 });
    await page.waitForTimeout(800);

    expect(await activeTestId(page)).toBe('filter-unread');
  });

  test('forward Tab cycles: controls -> search -> first notification action', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    await page.waitForTimeout(600);

    // After opening, focus should land on filter-unread.
    expect(await activeTestId(page)).toBe('filter-unread');

    // Tab through all 6 top controls.
    for (let i = 1; i < TOP_CONTROL_ORDER.length; i += 1) {
      await page.keyboard.press('Tab');
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(100);
      // eslint-disable-next-line no-await-in-loop
      expect(await activeTestId(page)).toBe(TOP_CONTROL_ORDER[i]);
    }

    // Tab from last control -> search input.
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    expect(await activeTestId(page)).toBe('notification-search');

    // Tab from search -> first notification action (toggle-read).
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const aid = await activeTestId(page);
    expect(aid).toMatch(/-toggle-read$/);
  });

  test('reverse Shift+Tab cycles back through controls', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    await page.waitForTimeout(600);

    // Tab forward to reach a notification action button.
    for (let i = 0; i < TOP_CONTROL_ORDER.length + 1; i += 1) {
      await page.keyboard.press('Tab');
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(100);
    }
    // Now on a notification action.
    const startId = await activeTestId(page);
    expect(startId).toMatch(/-toggle-read$/);

    // Shift+Tab back to search.
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    expect(await activeTestId(page)).toBe('notification-search');

    // Shift+Tab back through all top controls in reverse.
    const reversed = [...TOP_CONTROL_ORDER].reverse();
    for (const expected of reversed) {
      await page.keyboard.press('Shift+Tab');
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(100);
      // eslint-disable-next-line no-await-in-loop
      expect(await activeTestId(page)).toBe(expected);
    }

    // One more Shift+Tab wraps to notification action.
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    expect(await activeTestId(page)).toMatch(/-toggle-read$/);
  });
});
