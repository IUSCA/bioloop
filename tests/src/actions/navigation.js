/**
 * Navigates with a single retry when Playwright reports an aborted navigation
 * or a test-timeout during `goto` (e.g. SPA redirect races).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} targetPath - Path or URL passed to `page.goto`.
 * @returns {Promise<void>}
 */
async function gotoWithRetry(page, targetPath) {
  try {
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    const msg = String(error);
    if (!msg.includes('ERR_ABORTED') && !msg.includes('Test timeout')) {
      throw error;
    }
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  }
}

module.exports = {
  gotoWithRetry,
};
