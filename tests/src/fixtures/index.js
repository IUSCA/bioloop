import { test as base, expect } from '@playwright/test';
import { getToken } from './auth';

const { attachmentFixture } = require('./withAttachments');

// Compose all fixtures
const test = base.extend({

  /* eslint-disable */
  adminToken: async ({}, use) => {
    await use(await getToken({ role: 'admin' }));
  },
  operatorToken: async ({}, use) => {
    await use(await getToken({ role: 'operator' }));
  },
  userToken: async ({}, use) => {
    await use(await getToken({ role: 'user' }));
  },
  /* eslint-enable */

  // Attachments fixture
  ...attachmentFixture(),
});

export { expect, getToken, test };
