// import { request } from '@playwright/test';
// import adminApi from '../../../../services/adminApi';
// const axios = require('axios');

const config = require('config');

const { test, expect } = require('@playwright/test');

test('notifications created', async ({ page }) => {
  await page.goto('/');

  const token = await page.evaluate(() => localStorage.getItem('token'));

  const { request } = page;

  // todo - run "delete from dataset where is_duplicate=true;" before test
  // delete duplicates before test
  const deleteResponse = await request.delete(`${config.apiBasePath}/datasets?is_duplicate=true`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ignoreHTTPSErrors: true,
  });
  await deleteResponse.json();

  // Post duplicate dataset
  await request.post(`${config.apiBasePath}/datasets/3/duplicate`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ignoreHTTPSErrors: true,
  });

  await expect(page.getByTestId('notification-count-badge')).toContainText('1');
});
