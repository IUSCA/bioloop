const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  ensureNotificationsMenuOpen,
  ensureNotificationOpenButtonVisible,
  expectNotificationMenuInitialFocusSettled,
  searchInput,
  waitForNotificationMenuListIdle,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

test.describe('Notification search input', () => {
  test.describe.configure({ timeout: 180000 });
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('search field keeps focus while typing multiple characters', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await ensureNotificationsMenuOpen(page);
    await waitForNotificationMenuListIdle(page);
    await expectNotificationMenuInitialFocusSettled(page);

    const input = searchInput(page);
    await expect(input).toBeEnabled({ timeout: 15000 });
    await input.click({ force: true });
    await expect(input).toBeFocused();
    await input.pressSequentially('quota', { delay: 40 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('quota');
  });
});
