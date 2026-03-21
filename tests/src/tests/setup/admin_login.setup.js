import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { ADMIN_STORAGE_STATE } from '../../../playwright.paths';

const config = require('config');

setup('login', async ({ context, page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);

  // do a test that page is finished loading - checking for username is good
  // enough
  await expect(page.getByTestId('header-username')).toContainText(config.e2e.users.admin.username, { timeout: 20000 });

  await context.storageState({ path: ADMIN_STORAGE_STATE });
});
