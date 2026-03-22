const config = require('config');

function isFeatureEnabled({ key }) {
  if (!key) {
    return true;
  }

  const features = config.get('enabled_features');
  if (!features) {
    return true;
  }

  const featureConfig = features[key];
  if (featureConfig == null) {
    // feature's enabled status is not present in the config - assume enabled for backward compatibility
    return true;
  }
  if (typeof featureConfig === 'boolean') {
    return featureConfig;
  }
  // Object-style feature config: { enabled: true/false, ...options }
  if (typeof featureConfig === 'object' && typeof featureConfig.enabled === 'boolean') {
    return featureConfig.enabled;
  }
  // Unrecognized config shape — treat as disabled
  return false;
}

module.exports = {
  isFeatureEnabled,
};
