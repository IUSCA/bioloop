// import { request } from '@playwright/test';
// import adminApi from '../../../../services/adminApi';
// const axios = require('axios');

const config = require('config');

const { test, expect } = require('@playwright/test');

test('notifications created', async ({ page }) => {
  // await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);

  // do a test that page is finished loading - checking for username is good
  // enough
  // await
  // expect(page.getByTestId('header-username')).toContainText(config.e2e.users.admin.username);

  // await context.storageState({ path: ADMIN_STORAGE_STATE });

  // // ---

  await page.goto('/');

  // todo - When runnning the test in VS Code, making the call below makes
  //   axios throw "Error: connect ECONNREFUSED ::1:443"
  // const response = await adminApi.get('/datasets');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  console.log('token');
  console.log(token);
  //
  // const response = await axios({
  //   method: 'DELETE',
  //   url: `https://localhost/api/datasets?is_duplicate=true`,
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     'Content-Type': 'application/json',
  //   },
  //   httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  // });

  const { request } = page;
  const _apiResponse = await request.get(`${config.apiBasePath}/datasets`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ignoreHTTPSErrors: true,
    // httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  const responseBody = await _apiResponse.json()

  console.log('response')
  console.log(responseBody)

  expect(responseBody.datasets.length).toEqual(32);

  // todo - pre-test validation
  // await expect(page.getByTestId('notification-count-badge')).toText('0');

  // const token = await page.evaluate(() => localStorage.getItem('token'));

  // console.log('token');
  // console.log(token);

  // expect(token).not.toEqual("")

  // Set test state in API layer
  // await axios({
  //   method: 'POST',
  //   url: `${config.apiBasePath}/datasets/3/duplicate`,
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     'Content-Type': 'application/json',
  //   },
  //   httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  // });

  // await
  // expect(page.getByTestId('notification-count-badge')).toContainText('1');
});
