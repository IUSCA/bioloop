const config = require('config');

function isFeatureEnabled({ key, hasRole = () => false }) {
  if (!key) {
    return true;
  }

  const features = config.get('enabled_features');
  if (!features) {
    return true;
  }

  const featureEnabled = features[key];
  if (featureEnabled == null) {
    // feature's enabled status is not present in the config
    return true;
  } if (typeof featureEnabled === 'boolean') {
    // feature is either enabled or disabled for all roles
    return featureEnabled;
  } if (
    Array.isArray(featureEnabled.enabledForRoles)
    && featureEnabled.enabledForRoles.length > 0
  ) {
    // feature is enabled for certain roles
    return featureEnabled.enabledForRoles.some((role) => hasRole(role));
  }
  // invalid config found for feature's enabled status
  return false;
}

module.exports = {
  isFeatureEnabled,
};
