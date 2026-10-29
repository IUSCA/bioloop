const config = require('config');

// This refactor keeps the app's existing, statically configured role policy.
function getUploadEnabledRoles() {
  return config.enabledFeatures.uploads.enabledForRoles;
}

module.exports = { getUploadEnabledRoles };
