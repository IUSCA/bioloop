import { expect, test } from '../../../../fixtures';
import { createTestUser } from '../../../../api/user';
import { getTokenByRole } from '../../../../fixtures/auth';
import { loginAndNavigate } from '../../../../actions/auth';

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
    await loginAndNavigate({ page, ticket: 'admin', path: '/datasets/uploads' });

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(1);

    await context.close();
  });

  test('user does not see Upload Details navigation column', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndNavigate({ page, ticket: userRoleUser.username, path: '/datasets/uploads' });

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(0);

    await context.close();
  });
});
