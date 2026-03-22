const path = require('path');
require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');
const testRuntimeConfig = require('config');

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
    testDir: './src/tests',
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
      // baseURL: 'https://localhost',
      baseURL: process.env.TEST_BASE_URL || testRuntimeConfig.baseURL || 'https://localhost',

      /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
      trace: 'on-first-retry',
      headless: true,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      video: 'on-first-retry',
    },
    /* Ignore tests */
    testIgnore: ['**/view/authenticated/project/*.spec.js'],

    /* Configure Projects (groups of tests) */

    /** Login-setup projects */
    /** Project to login as admin */
    projects: [
      {
        name: 'admin_login',
        testMatch: path.join(
          __dirname,
          '/src/tests/setup/admin_login.setup.js',
        ),
      },
      /** Project to login as operator */
      {
        name: 'operator_login',
        testMatch: path.join(
          __dirname,
          '/src/tests/setup/operator_login.setup.js',
        ),
      },
      /** Project to login as user */
      {
        name: 'user_login',
        testMatch: path.join(
          __dirname,
          '/src/tests/setup/user_login.setup.js',
        ),
      },

      /** Tests than run in unauthenticated mode */
      {
        name: 'unauthenticated',
        use: { ...devices['Desktop Chrome'] },
        testMatch: '/view/unauthenticated/test.spec.js',
      },

      /** Tests than run in authenticated mode */
      /** Sidebar tests */
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
      /** Notifications tests */
      {
        name: 'admin_notifications',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: [
          '/view/authenticated/notifications/non_user_role_notifications.spec.js',
          '/view/authenticated/notifications/notification_cross_user_state.spec.js',
          '/view/authenticated/notifications/notification_theme_colors.spec.js',
          '/view/authenticated/notifications/notification_keyboard_a11y.spec.js',
          '/view/authenticated/notifications/notification_search_focus.spec.js',
          '/view/authenticated/notifications/notification_responsive_layout.spec.js',
        ],
      },
      {
        name: 'operator_notifications',
        use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
        dependencies: ['admin_notifications', 'operator_login'],
        testMatch: [
          '/view/authenticated/notifications/non_user_role_notifications.spec.js',
          '/view/authenticated/notifications/notification_cross_user_state.spec.js',
          '/view/authenticated/notifications/notification_theme_colors.spec.js',
          '/view/authenticated/notifications/notification_keyboard_a11y.spec.js',
          '/view/authenticated/notifications/notification_search_focus.spec.js',
          '/view/authenticated/notifications/notification_responsive_layout.spec.js',
        ],
      },
      {
        name: 'user_notifications',
        use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
        dependencies: ['user_login'],
        testMatch: [
          '/view/authenticated/notifications/user_role_notifications.spec.js',
          '/view/authenticated/notifications/notification_cross_user_state.spec.js',
          '/view/authenticated/notifications/notification_search_focus.spec.js',
        ],
      },
      /** User-management tests */
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
      /** Project tests */
      {
        name: 'project',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/project/*.spec.js',
      },
      /** Upload tests */
      {
        name: 'upload',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/upload/**/*.spec.js',
        testIgnore: '/view/authenticated/upload/project_association/user_role/association.spec.js',
      },
      {
        name: 'upload--project_association--user_role--association',
        use: { ...devices['Desktop Chrome'] },
        testMatch: '/view/authenticated/upload/project_association/user_role/association.spec.js',
      },
      /**
       * Role-Gated Feature Tests
       *
       * When a feature is role-gated, each role needs its own project so the
       * correct set of tests runs under the correct session.  The pattern is:
       *
       *  - Roles WITH access   → testMatch the full feature glob
       *                          testIgnore access_control.spec.js
       *                          (these roles reach the real UI, so the
       *                          "feature disabled" check must not run for them)
       *
       *  - Roles WITHOUT access → testMatch ONLY access_control.spec.js,
       *                           which asserts the "feature disabled" alert
       *                           is shown instead of the feature UI
       *
       * IMPORTANT — three configs must stay in sync whenever the role list changes:
       *   1. ui/src/config.js          enabledFeatures.<feature>.enabledForRoles
       *   2. tests/config/default.json enabledFeatures.<feature>.enabledForRoles
       *      (see the _sync_note key in that file)
       *   3. This file                 testMatch / testIgnore per project below
       *
       * To give a role access to the feature:
       *   - Add the role to both config files (steps 1 & 2).
       *   - Switch the project's testMatch to the full glob and add testIgnore
       *     for access_control.spec.js (step 3).
       *
       * To remove a role's access, reverse the steps above.
       */

      // admin — has import access: runs all functional tests
      {
        name: 'admin_import',
        use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
        dependencies: ['admin_login'],
        testMatch: '/view/authenticated/import/*.spec.js',
        testIgnore: '/view/authenticated/import/access_control.spec.js',
      },
      // operator — has import access: runs all functional tests
      {
        name: 'operator_import',
        use: { ...devices['Desktop Chrome'], storageState: OPERATOR_STORAGE_STATE },
        dependencies: ['operator_login'],
        testMatch: '/view/authenticated/import/*.spec.js',
        testIgnore: '/view/authenticated/import/access_control.spec.js',
      },
      // user — no import access: only verifies the "feature disabled" alert
      {
        name: 'user_import',
        use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
        dependencies: ['user_login'],
        testMatch: '/view/authenticated/import/access_control.spec.js',
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
  // attachmentsDir: path.join(__dirname, 'tests', 'attachments'),
};
