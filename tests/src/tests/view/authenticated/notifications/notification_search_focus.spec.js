const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  ensureNotificationsMenuOpen,
  ensureNotificationOpenButtonVisible,
  searchInput,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

test.describe('Notification search input', () => {
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('search field keeps focus while typing multiple characters', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await ensureNotificationsMenuOpen(page);
    // Menu open moves focus to the first filter; wait for that scheduling to finish
    // before asserting search field focus.
    await page.waitForTimeout(1200);

    const input = searchInput(page);
    await input.click({ force: true });
    await expect(input).toBeFocused();
    await input.pressSequentially('quota', { delay: 40 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('quota');
  });
});
