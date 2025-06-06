const config = require('config');

function isFeatureEnabled({ key }) {
  if (!key) {
    return true;
  }

  const features = config.get('enabled_features');
  if (!features) {
    return true;
  }

  const featureEnabled = features[key];
  if (featureEnabled == null) {
    // feature's enabled status is not present in the config - assume enabled
    return true;
  } if (typeof featureEnabled === 'boolean') {
    // feature is either enabled or disabled
    return featureEnabled;
  }
  // invalid config found for feature's enabled status
  return false;
}

module.exports = {
  isFeatureEnabled,
};
