const { defineConfig } = require('@playwright/test');

// Minimal configuration, standing up only what spike 1 needs.
// @see docs/design/groups/e2e-test-plan.md — Phase 0
module.exports = defineConfig({
  testDir: './src/specs',
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
