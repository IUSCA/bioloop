const { test, expect } = require('@playwright/test');
const config = require('config');
const {
  ensureNotificationOpenButtonVisible,
  openNotificationsMenu,
  searchInput,
} = require('./helpers');

const featureEnabled = config.enabledFeatures.notifications.enabledForRoles.length > 0;

test.describe('Notification search input', () => {
  test.skip(!featureEnabled, 'Notifications feature is disabled');

  test('search field keeps focus while typing multiple characters', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureNotificationOpenButtonVisible(page);
    await openNotificationsMenu(page);
    await page.waitForTimeout(400);

    const input = searchInput(page);
    await input.click();
    await expect(input).toBeFocused();
    await input.pressSequentially('quota', { delay: 40 });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('quota');
  });
});
