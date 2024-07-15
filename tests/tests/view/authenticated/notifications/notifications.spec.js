const _ = require('lodash');
const { test, expect } = require('@playwright/test');

const config = require('config');

const NUMBER_OF_NOTIFICATIONS = 2;
const NOTIFICATION_LABELS = _.range(NUMBER_OF_NOTIFICATIONS)
  .map((e, i) => `Notification Label ${i + 1}`);
const NOTIFICATION_TEXTS = _.range(NUMBER_OF_NOTIFICATIONS)
  .map((e, i) => `Notification Text ${i + 1}`);

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // delete active notifications before each test
  await page.goto('/');
  const { request } = page;
  const token = await page.evaluate(() => localStorage.getItem('token'));

  await deleteActiveNotifications(request, token);
});

test.describe('Notifications', () => {
  test('No notifications exist', async ({ page }) => {
    await expect(notificationBadgeLocator(page)).toBeEmpty();

    // Assert that no notifications are active
    // open the notification menu
    await page.getByTestId('notification-icon').click();
    await expect(page.getByTestId('notification-menu-items'))
      .toContainText('No pending notifications');
    await expect(notificationMenuItemLocator(page)).toHaveCount(1);
    // close the notification menu
    await page.getByTestId('notification-icon').click();
  });

  test('Notification created', async ({ page }) => {
    let createdNotifications;

    await test.step('Create notifications', async () => {
      await page.goto('/');
      const token = await page.evaluate(() => localStorage.getItem('token'));

      const { request } = page;

      createdNotifications = await createNotifications({ request, token });
    });

    await test.step('Assert', async () => {
      await expect(notificationBadgeLocator(page)).toContainText(`${NUMBER_OF_NOTIFICATIONS}`);

      // open the notification menu
      await page.getByTestId('notification-icon').click();

      await expect(notificationMenuItemLocator(page)).toHaveCount(NUMBER_OF_NOTIFICATIONS);

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < NUMBER_OF_NOTIFICATIONS; i++) {
        // eslint-disable-next-line no-await-in-loop
        await expect(page.getByTestId(`notification-${createdNotifications[i].id}-label`))
          .toContainText(NOTIFICATION_LABELS[i]);
        // eslint-disable-next-line no-await-in-loop
        await expect(page.getByTestId(`notification-${createdNotifications[i].id}-text`))
          .toContainText(NOTIFICATION_TEXTS[i]);
      }
    });
  });
});

const createNotifications = async ({ request, token }) => {
  const created = [];
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < NUMBER_OF_NOTIFICATIONS; i++) {
    // eslint-disable-next-line no-await-in-loop
    const notification = await createNotification(
      {
        request,
        token,
        label: NOTIFICATION_LABELS[i],
        text: NOTIFICATION_TEXTS[i],
      },
    );
    created.push(notification);
  }

  return created;
};

const notificationBadgeLocator = (page) => page.getByTestId('notification-count')
  .locator('span.va-badge__text');

const notificationMenuItemLocator = (page) => page.getByTestId('notification-menu-items')
  .locator('tr.va-menu-item');

const createNotification = async ({
  request, token, label, text,
}) => {
  const createResponse = await request.post(`${config.apiBasePath}/notifications`, {
    data: {
      label,
      text,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const createdNotification = await createResponse.json();
  return createdNotification;
};

const deleteActiveNotifications = async (request, token) => {
  const deleteResponse = await request.delete(`${config.apiBasePath}/notifications?active=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  await deleteResponse.json();
};
