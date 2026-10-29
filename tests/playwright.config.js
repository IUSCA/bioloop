const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.default') });

const { defineConfig, devices } = require('@playwright/test');
const config = require('config');
const { getUploadEnabledRoles } = require('./src/config/featureRoles');

const USER_STORAGE_STATE = path.join(__dirname, '.auth/user_storage_state.json');
const OPERATOR_STORAGE_STATE = path.join(__dirname, '.auth/operator_storage_state.json');
const ADMIN_STORAGE_STATE = path.join(__dirname, '.auth/admin_storage_state.json');
const uploadEnabledForRoles = getUploadEnabledRoles();

const sessions = {
  admin: ADMIN_STORAGE_STATE,
  operator: OPERATOR_STORAGE_STATE,
  user: USER_STORAGE_STATE,
};

function authenticatedProject(name, role, testMatch, extra = {}) {
  return {
    name,
    use: { ...devices['Desktop Chrome'], storageState: sessions[role] },
    dependencies: [`${role}_login`],
    testMatch,
    ...extra,
  };
}

const importProjects = Object.keys(sessions).map((role) => {
  const allowed = config.enabledFeatures.import.enabledForRoles.includes(role);
  return authenticatedProject(
    `${role}_import`,
    role,
    allowed
      ? '/view/authenticated/import/*.spec.js'
      : '/view/authenticated/import/access_control.spec.js',
    allowed ? { testIgnore: '/view/authenticated/import/access_control.spec.js' } : {},
  );
});

module.exports = {
  ...defineConfig({
    testDir: './src/tests',
    // These suites mutate shared seeded records; keep local and CI order stable.
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'html',
    use: {
      baseURL: process.env.TEST_BASE_URL || config.baseURL,
      trace: 'on-first-retry',
      headless: true,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      video: 'on-first-retry',
    },
    // Notification behavior is still WIP and has no agreed access policy.
    testIgnore: ['**/view/authenticated/notifications/*.spec.js'],
    projects: [
      ...Object.keys(sessions).map((role) => ({
        name: `${role}_login`,
        testMatch: path.join(__dirname, `src/tests/setup/${role}_login.setup.js`),
      })),
      {
        name: 'unauthenticated',
        use: { ...devices['Desktop Chrome'] },
        testMatch: '/view/unauthenticated/project.spec.js',
      },
      authenticatedProject('admin_sidebar', 'admin', '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js'),
      authenticatedProject('operator_sidebar', 'operator', '/view/authenticated/sidebar/non_user_role_sidebar_view.spec.js'),
      authenticatedProject('user_sidebar', 'user', '/view/authenticated/sidebar/user_role_sidebar_view.spec.js'),
      authenticatedProject('admin_user_management', 'admin', '/view/authenticated/userManagement/*.spec.js'),
      authenticatedProject('operator_user_management', 'operator', '/view/authenticated/userManagement/*.spec.js'),
      authenticatedProject('project', 'admin', '/view/authenticated/project/*.spec.js'),
      authenticatedProject('upload', 'admin', '/view/authenticated/upload/**/*.spec.js', {
        testIgnore: [
          '/view/authenticated/upload/project_association/user_role/association.spec.js',
          '/view/authenticated/upload/access_control.spec.js',
        ],
      }),
      ...Object.keys(sessions).map((role) => authenticatedProject(
        `upload_access_${role}`,
        role,
        '/view/authenticated/upload/access_control.spec.js',
      )),
      ...(uploadEnabledForRoles.includes('user') ? [authenticatedProject(
        'upload--project_association--user_role--association',
        'user',
        '/view/authenticated/upload/project_association/user_role/association.spec.js',
      )] : []),
      ...importProjects,
    ],
  }),
  USER_STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  ADMIN_STORAGE_STATE,
};
