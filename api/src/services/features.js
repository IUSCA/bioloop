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

/**
 * Role-aware variant of isFeatureEnabled. Handles both boolean
 * (`true`/`false`) and object (`{ enabledForRoles: [...] }`) config
 * shapes, mirroring the UI-side `isFeatureEnabled` in ui/src/services/utils.js.
 *
 * @param {{ key: string, roleName: string }} opts
 * @returns {boolean}
 */
function isFeatureEnabledForRole({ key, roleName }) {
  if (!key) return true;

  const features = config.get('enabled_features');
  if (!features) return true;

  const featureSetting = features[key];
  if (featureSetting == null) return true;
  if (typeof featureSetting === 'boolean') return featureSetting;
  if (typeof featureSetting !== 'object') return false;
  if (!Array.isArray(featureSetting.enabledForRoles)) return false;
  return featureSetting.enabledForRoles.includes(roleName);
}

module.exports = {
  isFeatureEnabled,
  isFeatureEnabledForRole,
};
