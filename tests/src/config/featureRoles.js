const KNOWN_ROLES = new Set(['admin', 'operator', 'user']);

function parseEnabledRoles(value, fallback = ['admin']) {
  const values = Array.isArray(value) ? value : value?.split(',');
  if (!values) return [...fallback];

  const roles = values
    .map((role) => String(role).trim().toLowerCase())
    .filter((role, index, allRoles) => (
      KNOWN_ROLES.has(role) && allRoles.indexOf(role) === index
    ));

  return roles.length > 0 ? roles : [...fallback];
}

function getUploadEnabledRoles() {
  return parseEnabledRoles(process.env.UPLOAD_ENABLED_ROLES);
}

module.exports = {
  getUploadEnabledRoles,
  parseEnabledRoles,
};
