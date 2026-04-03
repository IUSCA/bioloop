const path = require('path');
require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');
const testConfig = require('config');

const playwrightPaths = require('./playwright.paths');
const { createTargetRoles, buildFeatureEnabledRolesFromEnv } = require('./src/utils/feature');

/**
 * This file is the main configuration file for the Playwright test runner.
 * It is responsible for building the project list and configuring the test
 * runner.
 *
 * Notes:
 * - The word `project` in this context refers to a Playwright Project,
 *   which is a logical grouping of tests that are run together.
 *
 * @see
 * References:
 * - Tests Configuration: https://playwright.dev/docs/test-configuration
 * - Projects: https://playwright.dev/docs/test-projects.
 *
 */

const {
  USER_STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  ADMIN_STORAGE_STATE,
} = playwrightPaths;

const ROLE_SETTINGS = {
  admin: {
    storageState: ADMIN_STORAGE_STATE,
    loginProject: 'admin_login',
  },
  operator: {
    storageState: OPERATOR_STORAGE_STATE,
    loginProject: 'operator_login',
  },
  user: {
    storageState: USER_STORAGE_STATE,
    loginProject: 'user_login',
  },
};

/**
 * Builds one project definition for a specific role.
 *
 * This helper injects Desktop Chrome defaults, role-specific `storageState`,
 * and role metadata (`metadata.e2eRole`) so specs can reliably infer the
 * active role from `test.info().project.metadata`.
 *
 * @param {Object} options
 * @param {string} options.name - Playwright project name.
 * @param {'admin'|'operator'|'user'} options.role - Role tied to this project.
 * @param {string|string[]} options.testMatch - Glob(s) to include for this project.
 * @param {string|string[]=} options.testIgnore - Glob(s) to exclude for this project.
 * @param {string[]=} options.dependencies - Additional project dependencies besides role login.
 * @param {Object=} options.metadata - Extra metadata merged with `{ e2eRole: role }`.
 * @returns {Object} Playwright project config object.
 *
 * @example
 * const project = makeRoleProject({
 *   name: 'admin_import',
 *   role: 'admin',
 *   testMatch: '/view/authenticated/import/*.spec.js',
 *   testIgnore: '/view/authenticated/import/access_control.spec.js',
 * });
 * // project.name === 'admin_import'
 * // project.dependencies === ['admin_login']
 * // project.metadata === { e2eRole: 'admin' }
 */
function makeRoleProject({
  name,
  role,
  testMatch,
  testIgnore,
  dependencies = [],
  metadata = {},
}) {
  return {
    name,
    use: {
      ...devices['Desktop Chrome'],
      storageState: ROLE_SETTINGS[role].storageState,
    },
    dependencies: [ROLE_SETTINGS[role].loginProject, ...dependencies],
    testMatch,
    ...(testIgnore ? { testIgnore } : {}),
    metadata: { e2eRole: role, ...metadata },
  };
}

/**
 * Expands one role-gated feature into a project-per-role list.
 *
 * For each target role:
 * - if role is enabled for the feature, functional specs are matched and
 *   access-control spec is ignored;
 * - if role is not enabled, only the access-control spec is matched.
 *
 * @param {Object} options
 * @param {string} options.featureName - Feature suffix used in project name.
 * @param {string|string[]} options.testMatch - Functional spec glob(s).
 * @param {string|string[]} options.accessControlSpec - Access-control spec glob(s).
 * @param {string[]} options.enabledRoles - Roles currently allowed for the feature.
 * @param {string[]} options.targetRoles - Roles selected for this run.
 * @returns {Object[]} Role-scoped Playwright projects.
 *
 * @example
 * const projects = makeRoleGatedProjects({
 *   featureName: 'import',
 *   testMatch: '/view/authenticated/import/*.spec.js',
 *   accessControlSpec: '/view/authenticated/import/access_control.spec.js',
 *   enabledRoles: ['admin', 'operator'],
 *   targetRoles: ['admin', 'user'],
 * });
 * // projects.map((p) => [p.name, p.testMatch])
 * // => [
 * //   ['admin_import', '/view/authenticated/import/*.spec.js'],
 * //   ['user_import', '/view/authenticated/import/access_control.spec.js'],
 * // ]
 */
function makeRoleGatedProjects({
  featureName,
  testMatch,
  accessControlSpec,
  enabledRoles,
  targetRoles,
}) {
  return targetRoles.map((role) => {
    const canAccess = enabledRoles.includes(role);
    return makeRoleProject({
      name: `${role}_${featureName}`,
      role,
      testMatch: canAccess ? testMatch : accessControlSpec,
      testIgnore: canAccess ? accessControlSpec : undefined,
    });
  });
}

/**
 * Builds the full Playwright `projects` array for the current role/feature
 * matrix.
 *
 * This function composes:
 * - role-login setup projects (`admin_login`, etc.),
 * - optional unauthenticated projects per selected role,
 * - role-scoped authenticated projects per feature using allow-lists from env.
 *
 * @param {{ import: string[], uploads: string[], notifications: string[] }} featureEnabledRoles
 * Enabled roles resolved from env for each role-gated feature.
 * @param {string[]} targetRoles
 * Roles selected for this run (usually from `E2E_TARGET_ROLES`).
 * @param {boolean} skipUnauthenticated
 * When true, omits `*_unauthenticated` projects.
 * @returns {Object[]} Playwright project objects passed to `defineConfig({ projects })`.
 *
 * @example
 * const projects = buildProjectList(
 *   { import: ['admin'], uploads: ['admin', 'operator'], notifications: [] },
 *   ['admin', 'operator'],
 *   true,
 * );
 * // projects includes: admin_login, operator_login, admin_import,
 * // operator_import_access_control, admin_upload, operator_upload, ...
 *
 * @example
 * const projects = buildProjectList(
 *   { import: ['admin', 'operator'], uploads: ['admin'], notifications:
 *   ['admin'] }, ['user'],
 *   false,
 * );
 * // projects includes: user_login, user_unauthenticated,
 * // user_import_access_control, user_upload_access_control,
 * // user_notifications_access_control, user_sidebar, user_project
 */
function buildProjectList(featureEnabledRoles, targetRoles, skipUnauthenticated) {
  const isRoleSelected = (role) => targetRoles.includes(role);
  const projects = [];

  if (isRoleSelected('admin')) {
    projects.push({
      name: 'admin_login',
      testMatch: path.join(__dirname, '/src/tests/setup/admin_login.setup.js'),
    });
  }
  if (isRoleSelected('operator')) {
    projects.push({
      name: 'operator_login',
      testMatch: path.join(__dirname, '/src/tests/setup/operator_login.setup.js'),
    });
  }
  if (isRoleSelected('user')) {
    projects.push({
      name: 'user_login',
      testMatch: path.join(__dirname, '/src/tests/setup/user_login.setup.js'),
    });
  }

  if (!skipUnauthenticated) {
    targetRoles.forEach((role) => {
      projects.push({
        name: `${role}_unauthenticated`,
        use: { ...devices['Desktop Chrome'] },
        testMatch: '/view/unauthenticated/*.spec.js',
        metadata: { e2eRole: role },
      });
    });
  }

  ['admin', 'operator'].filter(isRoleSelected).forEach((role) => {
    projects.push(makeRoleProject({
      name: `${role}_sidebar_non_user`,
      role,
      testMatch: '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js',
    }));
  });
  ['admin', 'operator'].filter(
    (role) => isRoleSelected(role) && featureEnabledRoles.uploads.includes(role),
  ).forEach((role) => {
    projects.push(makeRoleProject({
      name: `${role}_upload_project_association_non_user_roles`,
      role,
      testMatch: '/view/authenticated/upload/project_association/non_user_roles/*.spec.js',
    }));
  });
  if (isRoleSelected('user')) {
    projects.push(makeRoleProject({
      name: 'user_sidebar',
      role: 'user',
      testMatch: '/view/authenticated/sidebar/user_role_sidebar_view.spec.js',
    }));
  }

  targetRoles.forEach((role) => {
    if (!featureEnabledRoles.notifications.includes(role)) {
      projects.push(makeRoleProject({
        name: `${role}_notifications_access_control`,
        role,
        testMatch: '/view/authenticated/notifications/access_control.spec.js',
      }));
      return;
    }

    if (role === 'user') {
      projects.push(makeRoleProject({
        name: 'user_notifications',
        role,
        testMatch: '/view/authenticated/notifications/user_role_notifications.spec.js',
      }));
      return;
    }

    projects.push(makeRoleProject({
      name: `${role}_notifications`,
      role,
      testMatch: [
        '/view/authenticated/notifications/role_specific_non_user_notifications.spec.js',
        '/view/authenticated/notifications/notification_*.spec.js',
      ],
    }));
  });

  ['admin', 'operator'].filter(isRoleSelected).forEach((role) => {
    projects.push(makeRoleProject({
      name: `${role}_user_management`,
      role,
      testMatch: '/view/authenticated/userManagement/*.spec.js',
    }));
  });

  ['admin', 'operator'].filter(isRoleSelected).forEach((role) => {
    projects.push(makeRoleProject({
      name: `${role}_project`,
      role,
      testMatch: [
        '/view/authenticated/project/*.spec.js',
        '/view/authenticated/dataset/*.spec.js',
      ],
      testIgnore: '/view/authenticated/project/user_role_*.spec.js',
    }));
  });
  if (isRoleSelected('user')) {
    projects.push(makeRoleProject({
      name: 'user_project',
      role: 'user',
      testMatch: '/view/authenticated/project/user_role_*.spec.js',
    }));
  }

  if (isRoleSelected('admin') && featureEnabledRoles.uploads.includes('admin')) {
    projects.push(makeRoleProject({
      name: 'admin_upload',
      role: 'admin',
      testMatch: '/view/authenticated/upload/**/*.spec.js',
      testIgnore: [
        '/view/authenticated/upload/project_association/user_role/*.spec.js',
        '/view/authenticated/upload/project_dataset_access.spec.js',
        '/view/authenticated/upload/project_association/non_user_roles/*.spec.js',
        '/view/authenticated/upload/access_control.spec.js',
      ],
    }));
  }
  if (isRoleSelected('user') && featureEnabledRoles.uploads.includes('user')) {
    projects.push(makeRoleProject({
      name: 'user_upload_project_association',
      role: 'user',
      testMatch: '/view/authenticated/upload/project_association/user_role/*.spec.js',
    }));
  }

  targetRoles.forEach((role) => {
    if (!featureEnabledRoles.uploads.includes(role)) return;
    projects.push(makeRoleProject({
      name: `${role}_upload_project_dataset_access`,
      role,
      testMatch: '/view/authenticated/upload/project_dataset_access.spec.js',
    }));
  });

  targetRoles.forEach((role) => {
    if (featureEnabledRoles.uploads.includes(role)) return;
    projects.push(makeRoleProject({
      name: `${role}_upload_access_control`,
      role,
      testMatch: '/view/authenticated/upload/access_control.spec.js',
    }));
  });

  projects.push(...makeRoleGatedProjects({
    featureName: 'import',
    testMatch: '/view/authenticated/import/*.spec.js',
    accessControlSpec: '/view/authenticated/import/access_control.spec.js',
    enabledRoles: featureEnabledRoles.import,
    targetRoles,
  }));

  return projects;
}

const baseURL = process.env.TEST_BASE_URL || testConfig.baseURL || 'https://localhost';

/**
 * Feature-role allow-lists resolved from env using the same inputs as UI
 * feature resolution (`VITE_FEATURE_ROLE_OVERRIDES`,
 * `VITE_*_ENABLED_FOR_ROLES`).
 *
 * This keeps Playwright project routing aligned with runtime feature-gating.
 *
 * @type {{ import: string[], uploads: string[], notifications: string[] }}
 */
const featureEnabledRoles = buildFeatureEnabledRolesFromEnv();

/**
 * Roles selected for this test run (typically from `E2E_TARGET_ROLES`).
 *
 * This determines which login/role-scoped projects are generated at all.
 *
 * @type {string[]}
 */
const targetRoles = createTargetRoles();

/**
 * Toggle for unauthenticated coverage in this run.
 *
 * When true (`E2E_SKIP_UNAUTHENTICATED=1`), `buildProjectList(...)` omits
 * `*_unauthenticated` projects and only schedules authenticated role projects.
 *
 * @type {boolean}
 */
const skipUnauthenticated = process.env.E2E_SKIP_UNAUTHENTICATED === '1';

/**
 * Final Playwright-project matrix for this run.
 *
 * This is derived from three setup/config inputs:
 * - `featureEnabledRoles` (mapping of which roles can access which feature),
 * - `targetRoles` (which roles this run should include),
 * - `skipUnauthenticated` (whether unauthenticated projects are included).
 *
 * `module.exports = defineConfig({ projects })` consumes this value directly.
 *
 * @type {Object[]}
 */
const projects = buildProjectList(featureEnabledRoles, targetRoles, skipUnauthenticated);

/**
 * The main configuration for the Playwright test runner.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    video: 'on-first-retry',
  },
  testIgnore: [],
  projects,
});
