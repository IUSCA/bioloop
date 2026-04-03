import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { USER_STORAGE_STATE } from '../../../playwright.paths';

// import config from 'config';
const config = require('config');

// setup.setTimeout(120000);

setup('login', async ({ page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=user`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.url(),
  // { timeout: 90000 }
  ).not.toContain('/auth/iucas');
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const state = await page.context().storageState();
  const localStorageEntries = state.origins.flatMap((origin) => origin.localStorage || []);
  const tokenEntry = localStorageEntries.find(({ name }) => name === 'token');
  const userEntry = localStorageEntries.find(({ name }) => name === 'user');
  expect(tokenEntry?.value).toBeTruthy();
  expect(userEntry?.value).toContain(config.e2e.users.user.username);

  await page.context().storageState({ path: USER_STORAGE_STATE });
});
