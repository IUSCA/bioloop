const { chromium, request } = require('@playwright/test');
const { API_BASE } = require('./world/api');

/**
 * Warms both servers once, before any test runs.
 *
 * The development UI is served by Vite, which compiles a route the first time somebody asks
 * for it. That first navigation can take tens of seconds while every later one takes under
 * one, so the cost lands on whichever test happens to run first and looks like that test
 * being slow. It is not: a run against cold servers failed two browser-driven tests at once,
 * and the same two passed on every warm run afterwards.
 *
 * Paying the compile here turns an unpredictable failure into a visible, one-time wait, and
 * it fails with a message naming the server that is not up rather than a timeout inside an
 * unrelated assertion.
 *
 * @see docs/design/groups/e2e-test-plan.md — Phase 1
 */

/** Generous, because a cold Vite compile is genuinely slow. This is a wait, not an assertion. */
const WARMUP_TIMEOUT_MS = 180_000;

/**
 * How long to keep asking the API for a heartbeat before giving up, and how long to pause
 * between attempts.
 *
 * The development API runs under a file watcher, so it restarts whenever anybody saves a file
 * in `api/`, and it refuses connections for a second or two each time. One unlucky attempt
 * killed four consecutive runs here while the server itself was healthy. Retrying is not
 * papering over a flaky test: this is the step whose job is to wait until the servers are
 * ready, and a restart window is exactly what it should absorb. A server that is genuinely
 * not running still fails, one minute later, with the same message.
 */
const API_READY_TIMEOUT_MS = 60_000;
const API_RETRY_INTERVAL_MS = 1_000;

async function waitForApi() {
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  const deadline = Date.now() + API_READY_TIMEOUT_MS;
  let lastFailure = 'no attempt was made';
  try {
    while (Date.now() < deadline) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const health = await api.get(`${API_BASE}/health`, { timeout: API_RETRY_INTERVAL_MS * 5 });
        if (health.ok()) {
          return;
        }
        lastFailure = `answered ${health.status()}`;
      } catch (err) {
        lastFailure = err.message.split('\n')[0];
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, API_RETRY_INTERVAL_MS); });
    }
  } finally {
    await api.dispose();
  }
  throw new Error(
    `Cannot reach the API at ${API_BASE} after ${API_READY_TIMEOUT_MS / 1000}s: ${lastFailure}\n`
    + 'Start the development servers before running this suite.',
  );
}

async function globalSetup(config) {
  const baseURL = config.projects[0]?.use?.baseURL || 'https://localhost';

  await waitForApi();

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await page.goto(baseURL, { timeout: WARMUP_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
    // Vite has served the entry, but the application has not mounted until `#app` has
    // children. Waiting on navigation alone would return before the compile finished.
    await page.waitForFunction(
      () => document.querySelector('#app')?.children.length > 0,
      null,
      { timeout: WARMUP_TIMEOUT_MS },
    );
  } catch (err) {
    throw new Error(
      `Cannot reach the UI at ${baseURL}: ${err.message}\n`
      + 'Start the development servers before running this suite.',
    );
  } finally {
    await browser.close();
  }
}

module.exports = globalSetup;
