const config = require('config');

const { expect } = require('../fixtures');

/**
 * Logs in as a given role (via CAS ticket) and navigates to a target path.
 *
 * @param {Object}  params
 * @param {import('@playwright/test').Page} params.page    - Playwright page
 * @param {string}  params.ticket  - CAS ticket value (e.g. 'admin', 'user', or a username)
 * @param {string}  [params.path]  - Path to navigate to after login (e.g. '/datasets/uploads')
 * @param {string}  [params.waitForTestId] - If provided, waits for this testid to be visible after navigation
 */
async function loginAndNavigate({
  page, ticket, path: targetPath, waitForTestId,
}) {
  await page.goto(`${config.baseURL}/auth/iucas?ticket=${ticket}`, { waitUntil: 'domcontentloaded' });

  if (targetPath) {
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  }

  if (waitForTestId) {
    await expect(page.getByTestId(waitForTestId)).toBeVisible();
  }
}

module.exports = {
  loginAndNavigate,
};
