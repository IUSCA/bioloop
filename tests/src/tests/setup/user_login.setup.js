import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { USER_STORAGE_STATE } from '../../../playwright.config';

// import config from 'config';
const config = require('config');

setup('login', async ({ page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=user`);

  // do a test that page is finished loading - checking for username is good
  // enough
  await expect(page.getByTestId('header-username')).toContainText(config.e2e.users.user.username);

  await page.context().storageState({ path: USER_STORAGE_STATE });
});
