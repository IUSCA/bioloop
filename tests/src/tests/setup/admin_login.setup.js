import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { ADMIN_STORAGE_STATE } from '../../../playwright.config';

const config = require('config');

setup('login', async ({ context, page, baseURL }) => {
  console.log('baseURL', baseURL);

  console.log('-----------admin_login_setup.js-----------');
  console.log('config.baseURL', config.baseURL);

  await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);

  // do a test that page is finished loading - checking for username is good
  // enough
  await expect(page.getByTestId('header-username')).toContainText(config.e2e.users.admin.username);

  await context.storageState({ path: ADMIN_STORAGE_STATE });
});
