const config = require('config');

const { test, expect } = require('@playwright/test');

const NOTIFICATION_LABEL = 'Notification Label';
const NOTIFICATION_TEXT = 'Notification Text';

// todo
//  tests for
//   different roles

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // delete active notifications before each test

  await page.goto('/');
  const { request } = page;

  const token = await page.evaluate(() => localStorage.getItem('token'));

  const deleteResponse = await request.delete(`${config.apiBasePath}/notifications?active=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  await deleteResponse.json();
});

test.describe('Notifications', () => {
  test('No notifications exist', async ({ page }) => {
    const badgeTextLocator = page.getByTestId('notification-count')
      .locator('span.va-badge__text');
    await expect(badgeTextLocator).toBeEmpty();

    // Assert that no notifications are active
    // open the notification menu
    await page.getByTestId('notification-icon').click();
    await expect(page.getByTestId('notification-menu-items'))
      .toContainText('No pending notifications');
    // close the notification menu
    await page.getByTestId('notification-icon').click();
  });

  test('Notification created', async ({ page }) => {
    let createdNotification;

    await test.step('Create a notification', async () => {
      await page.goto('/');
      const token = await page.evaluate(() => localStorage.getItem('token'));

      const { request } = page;

      // create a notification
      const createResponse = await request.post(`${config.apiBasePath}/notifications`, {
        data: {
          label: NOTIFICATION_LABEL,
          text: NOTIFICATION_TEXT,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
        ignoreHTTPSErrors: true,
      });
      createdNotification = await createResponse.json();
    });

    await test.step('Assert', async () => {
      const badgeTextLocator = page.getByTestId('notification-count')
        .locator('span.va-badge__text');
      await expect(badgeTextLocator).toContainText('1');

      // open the notification menu
      await page.getByTestId('notification-icon').click();

      await expect(page.getByTestId(`notification-${createdNotification.id}-label`))
        .toContainText(NOTIFICATION_LABEL);
      await expect(page.getByTestId(`notification-${createdNotification.id}-text`))
        .toContainText(NOTIFICATION_TEXT);
    });
  });
});
