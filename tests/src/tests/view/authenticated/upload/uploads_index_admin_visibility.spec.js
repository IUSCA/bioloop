import { expect, test } from '../../../../fixtures';
import { loginAndNavigate } from '../../../../actions/auth';

test.describe('Uploads list role visibility', () => {
  test('admin sees Upload Details navigation column', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndNavigate({
      page,
      ticket: 'admin',
      path: '/datasets/uploads',
      waitForTestId: 'uploads-history-table',
    });

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(1, { timeout: 30000 });

    await context.close();
  });

  test('user sees Upload Details navigation column', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAndNavigate({
      page,
      ticket: 'user',
      path: '/datasets/uploads',
      waitForTestId: 'uploads-history-table',
    });

    await expect(page.locator('th', { hasText: 'Upload Details' })).toHaveCount(1, { timeout: 30000 });

    await context.close();
  });
});
