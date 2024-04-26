import https from 'node:https';

const { test, expect } = require('@playwright/test');
const axios = require('axios');
const config = require('config');

test('notifications created', async ({ page }) => {
  // await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);

  // do a test that page is finished loading - checking for username is good
  // enough
  // await
  // expect(page.getByTestId('header-username')).toContainText(config.e2e.users.admin.username);

  // await context.storageState({ path: ADMIN_STORAGE_STATE });

  // // ---

  // todo - issues:
  //  token is null
  await page.goto('/');

  // todo - pre-test validation
  // await expect(page.getByTestId('notification-count-badge')).toText('0');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  console.log('token');
  console.log(token);
  
  // expect(token).not.toEqual("")

  // Set test state in API layer
  await axios({
    method: 'POST',
    url: `${config.apiBaseURL}/datasets/3/duplicate`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  await expect(page.getByTestId('notification-count-badge')).toContainText('1');
});
