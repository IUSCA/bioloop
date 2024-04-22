import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { USER_STORAGE_STATE } from '../../playwright.config';

// import config from 'config';
const config = require('config');

setup('login', async ({ page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=operator`);

  // do a test that page is finished loading - checking for username is good
  // enough
  await expect(page.getByTestId('header-username')).toContainText('e2eOperator');

  await page.context().storageState({ path: USER_STORAGE_STATE });
});
