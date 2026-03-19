import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { ADMIN_STORAGE_STATE } from '../../../playwright.config';

const config = require('config');

setup('login', async ({ context, page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`);
  // Verify authentication completed and username is displayed.
  await expect(page.getByTestId('header-username')).toContainText(config.e2e.users.admin.username);

  await context.storageState({ path: ADMIN_STORAGE_STATE });
});
