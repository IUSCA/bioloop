const config = require('config');

const { test, expect } = require('@playwright/test');

const NOTIFICATION_LABEL = 'Notification Label';
const NOTIFICATION_TEXT = 'Notification Text';

// todos
//  tests for
//   different roles

test.describe.configure({ mode: 'serial' });

test.describe('Notifications', () => {
  test('No notifications exist', async ({ page }) => {
    await page.goto('/');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    // console.log('token');
    // console.log(token);
    // console.log(config.apiBasePath);

    const { request } = page;

    // await
    // expect(page.getByTestId('notification-menu-items')).not.toBeVisible();

    // delete active notifications before test
    const deleteResponse = await request.delete(`${config.apiBasePath}/notifications?active=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      ignoreHTTPSErrors: true,
    });
    await deleteResponse.json();

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
    const createdNotification = await createResponse.json();

    // ```

    const badgeTextLocator = page.getByTestId('notification-count')
      .locator('span.va-badge__text');
    await expect(badgeTextLocator).toContainText('1');
    // ```

    // open the notification menu
    await page.getByTestId('notification-icon').click();

    await expect(page.getByTestId(`notification-${createdNotification.id}-label`))
      .toContainText(NOTIFICATION_LABEL);
    await expect(page.getByTestId(`notification-${createdNotification.id}-text`))
      .toContainText(NOTIFICATION_TEXT);
  });
});
