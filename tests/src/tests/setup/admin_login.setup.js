import { expect, test as setup } from '@playwright/test';
// eslint-disable-next-line import/named
import { ADMIN_STORAGE_STATE } from '../../../playwright.paths';

const config = require('config');

setup('login', async ({ context, page }) => {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=admin`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.url(),
  // { timeout: 90000 }
  ).not.toContain('/auth/iucas');
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const state = await context.storageState();
  const localStorageEntries = state.origins.flatMap((origin) => origin.localStorage || []);
  const tokenEntry = localStorageEntries.find(({ name }) => name === 'token');
  const userEntry = localStorageEntries.find(({ name }) => name === 'user');
  expect(tokenEntry?.value).toBeTruthy();
  expect(userEntry?.value).toContain(config.e2e.users.admin.username);

  await context.storageState({ path: ADMIN_STORAGE_STATE });
});
