import { expect, test } from '../../../../fixtures';
import { createTestUser } from '../../../../api/user';
import { getTokenByRole } from '../../../../fixtures/auth';

const config = require('config');

async function loginAndGoToUploads(page, ticket) {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=${ticket}`);
  // Wait for login to complete and app to initialize
  await page.waitForLoadState('networkidle');
  await page.goto('/datasets/uploads');
  await page.waitForLoadState('networkidle');
}

test.describe('Uploads list role visibility', () => {
  let userRoleUser;

  test.beforeAll(async ({ request }) => {
    const adminToken = await getTokenByRole({ role: 'admin' });
    userRoleUser = await createTestUser({
      requestContext: request,
      token: adminToken,
      role: 'user',
    });
  });

  test('admin sees Upload Details navigation column', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndGoToUploads(page, 'admin');

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(1);

    await context.close();
  });

  test('user does not see Upload Details navigation column', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndGoToUploads(page, userRoleUser.username);

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(0);

    await context.close();
  });
});
