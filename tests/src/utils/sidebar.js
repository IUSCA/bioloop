const { buildFeatureEnabledRolesFromEnv } = require('./feature');

/**
 * Infers canonical role from Playwright project name prefix.
 *
 * Expected naming pattern is `<role>_...`, such as `admin_upload` or
 * `user_notifications`.
 *
 * @param {string} projectName - Playwright project name.
 * @returns {'admin'|'operator'|'user'} Inferred role.
 * @throws {Error} When project name does not include a known role prefix.
 *
 * @example
 * inferRoleFromProjectName('admin_project');
 * // => 'admin'
 *
 * @example
 * inferRoleFromProjectName('user_notifications');
 * // => 'user'
 */
function inferRoleFromProjectName(projectName) {
  if (projectName.startsWith('admin_')) return 'admin';
  if (projectName.startsWith('operator_')) return 'operator';
  if (projectName.startsWith('user_')) return 'user';
  throw new Error(`Unable to infer role from project: ${projectName}`);
}

/**
 * Builds expected sidebar visibility and navigable routes for one role.
 *
 * The result mirrors UI feature-flag behavior:
 * - `sidebar-create-dataset` is visible when either import or uploads is
 *   enabled for the role.
 * - user role hides non-user operational sections.
 * - `navigableRoutes` includes role-allowed core pages + feature routes.
 *
 * @param {'admin'|'operator'|'user'} role - Role under test.
 * @returns {{visibleTestIds: string[], hiddenTestIds: string[], navigableRoutes: string[]}}
 * Sidebar expectations used by sidebar specs.
 *
 * @example
 * // If uploads/import are admin-only:
 * getSidebarExpectationsForRole('user');
 * // => {
 * //   visibleTestIds: ['sidebar-projects', 'sidebar-about', 'sidebar-profile', 'sidebar-logout'],
 * //   hiddenTestIds: ['sidebar-create-dataset', 'sidebar-dashboard', ...],
 * //   navigableRoutes: ['/projects', '/about', '/profile'],
 * // }
 *
 * @example
 * // Admin typically gets operational routes:
 * getSidebarExpectationsForRole('admin');
 * // => {
 * //   visibleTestIds: ['sidebar-projects', ..., 'sidebar-dashboard', ...],
 * //   hiddenTestIds: [],
 * //   navigableRoutes: ['/projects', '/about', '/profile', '/dashboard', ...],
 * // }
 */
function getSidebarExpectationsForRole(role) {
  const featureEnabledRoles = buildFeatureEnabledRolesFromEnv();
  const canCreateDataset = (
    featureEnabledRoles.import.includes(role)
    || featureEnabledRoles.uploads.includes(role)
  );

  const visibleTestIds = ['sidebar-projects', 'sidebar-about', 'sidebar-profile', 'sidebar-logout'];
  const hiddenTestIds = [];

  if (canCreateDataset) visibleTestIds.push('sidebar-create-dataset');
  else hiddenTestIds.push('sidebar-create-dataset');

  if (role === 'user') {
    hiddenTestIds.push(
      'sidebar-dashboard',
      'sidebar-raw-data',
      'sidebar-data-products',
      'sidebar-user-management',
      'sidebar-stats-tracking',
      'sidebar-workflows',
      'sidebar-alerts',
    );
  } else {
    visibleTestIds.push(
      'sidebar-dashboard',
      'sidebar-raw-data',
      'sidebar-data-products',
      'sidebar-user-management',
      'sidebar-stats-tracking',
      'sidebar-workflows',
      'sidebar-alerts',
    );
  }

  const navigableRoutes = ['/projects', '/about', '/profile'];
  if (role !== 'user') {
    navigableRoutes.push('/dashboard', '/rawdata', '/dataproducts', '/users', '/stats', '/workflows', '/alerts');
  }
  if (featureEnabledRoles.import.includes(role)) navigableRoutes.push('/datasets/import');
  if (featureEnabledRoles.uploads.includes(role)) navigableRoutes.push('/datasetUpload');

  return {
    visibleTestIds,
    hiddenTestIds,
    navigableRoutes,
  };
}

module.exports = {
  inferRoleFromProjectName,
  getSidebarExpectationsForRole,
};
