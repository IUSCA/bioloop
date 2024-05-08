const { test, expect } = require('@playwright/test');

test.describe('Notifications', () => {
  test('Notification menu not visible', async ({ page }) => {
    await expect(page.getByTestId('notification-icon')).not.toBeVisible();
  });
});
