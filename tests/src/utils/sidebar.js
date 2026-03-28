const { buildFeatureEnabledRolesFromEnv } = require('./feature');

function inferRoleFromProjectName(projectName) {
  if (projectName.startsWith('admin_')) return 'admin';
  if (projectName.startsWith('operator_')) return 'operator';
  if (projectName.startsWith('user_')) return 'user';
  throw new Error(`Unable to infer role from project: ${projectName}`);
}

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
