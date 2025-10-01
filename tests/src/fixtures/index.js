import { test as base, expect } from '@playwright/test';
import { getTokenByRole } from './auth';

const { attachmentFixture } = require('./withAttachments');

// Compose all fixtures
const test = base.extend({

  /* eslint-disable */
  adminToken: async ({}, use) => {
    await use(await getTokenByRole({ role: 'admin' }));
  },
  operatorToken: async ({}, use) => {
    await use(await getTokenByRole({ role: 'operator' }));
  },
  userToken: async ({}, use) => {
    await use(await getTokenByRole({ role: 'user' }));
  },
  /* eslint-enable */

  // Attachments fixture
  ...attachmentFixture(),
});

export { expect, test };
