const { defineConfig } = require('@playwright/test');

// Configuration for the v2 end-to-end suite.
// @see e2e/README.md — Running it
module.exports = defineConfig({
  testDir: './src/specs',
  // Compiles the first UI route and checks the API answers, once, before any test. Without
  // it the first browser-driven test absorbs a cold Vite compile and fails on a timeout that
  // has nothing to do with what it asserts.
  globalSetup: require.resolve('./src/global-setup'),
  fullyParallel: false,
  // Local runs do not retry: a half-completed test that clicked a toggle once is worth
  // diagnosing, and a retry would click it a second time and turn it back off.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://localhost',
    // The dev UI is served behind a self-signed certificate.
    ignoreHTTPSErrors: true,
    // The installed Chrome, so no browser download is needed. Playwright drives it over
    // CDP, which is the whole point of the spike: real input rather than dispatched events.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
