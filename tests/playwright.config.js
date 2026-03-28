const path = require('path');
require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');
const testConfig = require('config');

const playwrightPaths = require('./playwright.paths');
const { createTargetRoles, buildFeatureEnabledRolesFromEnv } = require('./src/utils/feature');

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
 * @param {{ import: string[], uploads: string[], notifications: string[] }} featureEnabledRoles
 * @param {string[]} targetRoles
 * @param {boolean} skipUnauthenticated
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
      testMatch: '/features/upload/project_association/non_user_roles/*.spec.js',
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
    const notifSpec = featureEnabledRoles.notifications.includes(role)
      ? '/view/authenticated/notifications/non_user_role_notifications.spec.js'
      : '/view/authenticated/notifications/user_role_notifications.spec.js';
    projects.push(makeRoleProject({
      name: `${role}_notifications`,
      role,
      testMatch: notifSpec,
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
      testMatch: '/view/authenticated/project/*.spec.js',
    }));
  });

  if (isRoleSelected('admin')) {
    projects.push(makeRoleProject({
      name: 'admin_upload',
      role: 'admin',
      testMatch: '/features/upload/**/*.spec.js',
      testIgnore: [
        '/features/upload/project_association/user_role/*.spec.js',
        '/features/upload/project_dataset_access.spec.js',
        '/features/upload/project_association/non_user_roles/*.spec.js',
      ],
    }));
  }
  if (isRoleSelected('user') && featureEnabledRoles.uploads.includes('user')) {
    projects.push(makeRoleProject({
      name: 'user_upload_project_association',
      role: 'user',
      testMatch: '/features/upload/project_association/user_role/*.spec.js',
    }));
  }

  targetRoles.forEach((role) => {
    if (!featureEnabledRoles.uploads.includes(role)) return;
    projects.push(makeRoleProject({
      name: `${role}_upload_project_dataset_access`,
      role,
      testMatch: '/features/upload/project_dataset_access.spec.js',
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
// Role lists for import/uploads/notifications: same env vars as the UI build
// (`VITE_FEATURE_ROLE_OVERRIDES`, `VITE_*_ENABLED_FOR_ROLES`); see
// `src/utils/feature.js`.
const featureEnabledRoles = buildFeatureEnabledRolesFromEnv();
const targetRoles = createTargetRoles();
const skipUnauthenticated = process.env.E2E_SKIP_UNAUTHENTICATED === '1';
const projects = buildProjectList(featureEnabledRoles, targetRoles, skipUnauthenticated);

/**
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
