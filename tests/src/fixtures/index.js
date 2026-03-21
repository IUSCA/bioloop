import { test as base, expect } from '@playwright/test';
import { getTokenByRole } from './auth';

const { attachmentFixture } = require('./attachment');

// Compose all fixtures
const test = base.extend({

  // Token-retrieval fixtures
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

  // Attachment fixture
  ...attachmentFixture(),
});

export { expect, test };
