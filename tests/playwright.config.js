const path = require('path');
require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');

const USER_STORAGE_STATE = path.join(__dirname, '/.auth/user_storage_state.json');
const OPERATOR_STORAGE_STATE = path.join(__dirname, '/.auth/operator_storage_state.json');
const ADMIN_STORAGE_STATE = path.join(__dirname, '/.auth/admin_storage_state.json');

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = {
  ...defineConfig({
    testDir: './tests',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /**
   * Fail the build on CI if you accidentally left test.only in the source
   * code.
   */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
      baseURL: 'https://localhost',

      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'on-first-retry',
      headless: true,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      video: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
      //   todo - organize tests by role type
      {
        name: 'admin_login',
        testMatch: path.join(__dirname, '/tests/setup/admin_login.setup.js'),
      },
      {
        name: 'operator_login',
        testMatch: path.join(__dirname, '/tests/setup/operator_login.setup.js'),
      },
      {
        name: 'user_login',
        testMatch: path.join(__dirname, '/tests/setup/user_login.setup.js'),
      },
      {
        name: 'unauthenticated',
        use: { ...devices['Desktop Chrome'] },
        testMatch: '/view/unauthenticated/project.spec.js',
      },
      {
        name: 'admin_sidebar',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js',
      },

      {
        name: 'operator_sidebar',
        use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
        dependencies: ['operator_login'],
        testMatch: '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js',
      },
      {
        name: 'user_sidebar',
        use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
        dependencies: ['user_login'],
        testMatch: '/view/authenticated/sidebar/user_role_sidebar_view.spec.js',
      },
      {
        name: 'admin_notifications',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/notifications/non_user_role_notifications.spec.js',
      },
      {
        name: 'operator_notifications',
        use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
        dependencies: ['admin_notifications', 'operator_login'],
        testMatch: '/view/authenticated/notifications/non_user_role_notifications.spec.js',
      },
      {
        name: 'user_notifications',
        use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
        dependencies: ['user_login'],
        testMatch: '/view/authenticated/notifications/user_role_notifications.spec.js',
      },
      {
        name: 'admin_user_management',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/userManagement/*.spec.js',
      },
      {
        name: 'operator_user_management',
        use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
        dependencies: ['operator_login'],
        testMatch: '/view/authenticated/userManagement/*.spec.js',
      },
      {
        name: 'project',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/project/*.spec.js',
      },
      // { name: 'firefox', use: {
      // ...devices['Desktop Firefox'] }, },
      //
      // {
      //   name: 'webkit',
      //   use: { ...devices['Desktop Safari'] },
      // },

      /* Test against mobile viewports. */
      // {
      //   name: 'Mobile Chrome',
      //   use: { ...devices['Pixel 5'] },
      // },
      // {
      //   name: 'Mobile Safari',
      //   use: { ...devices['iPhone 12'] },
      // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
    ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
  }),
  USER_STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  ADMIN_STORAGE_STATE,
};
