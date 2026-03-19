import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { OPERATOR_STORAGE_STATE } from '../../../playwright.config';

// import config from 'config';
const config = require('config');

setup('login', async ({ page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=operator`);
  // Verify authentication completed and username is displayed.
  await expect(page.getByTestId('header-username')).toContainText(config.e2e.users.operator.username);

  await page.context().storageState({ path: OPERATOR_STORAGE_STATE });
});
