/**
 * E2E helpers: `E2E_TARGET_ROLES` parsing,
 * and feature allow-lists for Playwright project routing via
 * **`buildFeatureEnabledRolesFromEnv()`** — same env vars and precedence as
 * `ui/src/services/features.js` (`VITE_ALLOW_FEATURE_ROLE_OVERRIDES`,
 * `VITE_FEATURE_ROLE_OVERRIDES`, `VITE_*_ENABLED_FOR_ROLES`).
 *
 * The UI remains the behavioral source of truth at runtime;
 * tests read **process.env** so `playwright.config.js` can stay synchronous
 * (see `.ai/features/e2e_suite.md` “Feature roles in Playwright”).
 *
 * @module utils/feature
 */

/** @type {readonly ['admin', 'operator', 'user']} */
const ALL_ROLES = ['admin', 'operator', 'user'];

/**
 * Parses `E2E_TARGET_ROLES` (comma-separated) into the list of roles that
 * should get login projects and role-scoped Playwright projects.
 *
 * @param {string | undefined} value - Raw env value (e.g. `admin,user`).
 * @returns {string[]} Known roles only; if empty after parsing, returns all roles.
 */
function parseRoles(value) {
  if (!value) return [...ALL_ROLES];
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .filter((role) => ALL_ROLES.includes(role));
  return roles.length > 0 ? roles : [...ALL_ROLES];
}

/**
 * @returns {string[]}
 */
function createTargetRoles() {
  return parseRoles(process.env.E2E_TARGET_ROLES);
}

/**
 * @param {string | undefined} value
 * @param {string[]} defaultRoles
 * @returns {string[]}
 */
function parseFeatureRoles(value, defaultRoles) {
  if (value == null) return defaultRoles;
  if (value.trim() === '') return [];
  return value
    .split(',')
    .map((role) => role.trim())
    .filter((role) => ALL_ROLES.includes(role));
}

/**
 * @returns {Record<string, unknown>}
 */
function parseFeatureRoleOverrides() {
  if (process.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES !== '1') return {};
  const raw = process.env.VITE_FEATURE_ROLE_OVERRIDES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

/**
 * Resolves enabled roles for one feature from env only (mirrors UI precedence).
 *
 * @param {Object} options
 * @param {string} options.featureKey
 * @param {string} options.rolesListEnvVar
 * @param {string[]} options.defaultRoles
 * @returns {string[]}
 */
function getFeatureEnabledRolesFromEnv({
  featureKey,
  rolesListEnvVar,
  defaultRoles,
}) {
  const featureRoleOverrides = parseFeatureRoleOverrides();
  const overrideRoles = featureRoleOverrides[featureKey];
  if (Array.isArray(overrideRoles)) {
    return overrideRoles.filter((role) => ALL_ROLES.includes(role));
  }
  return parseFeatureRoles(process.env[rolesListEnvVar], defaultRoles);
}

/**
 * Builds `{ import, uploads, notifications }` from `process.env` (fallback
 * path).
 *
 * @returns {{ import: string[], uploads: string[], notifications: string[] }}
 */
function buildFeatureEnabledRolesFromEnv() {
  return {
    import: getFeatureEnabledRolesFromEnv({
      featureKey: 'import',
      rolesListEnvVar: 'VITE_IMPORT_ENABLED_FOR_ROLES',
      defaultRoles: ['admin'],
    }),
    uploads: getFeatureEnabledRolesFromEnv({
      featureKey: 'uploads',
      rolesListEnvVar: 'VITE_UPLOADS_ENABLED_FOR_ROLES',
      defaultRoles: ['admin'],
    }),
    notifications: getFeatureEnabledRolesFromEnv({
      featureKey: 'notifications',
      rolesListEnvVar: 'VITE_NOTIFICATIONS_ENABLED_FOR_ROLES',
      defaultRoles: [],
    }),
  };
}

module.exports = {
  ALL_ROLES,
  parseRoles,
  createTargetRoles,
  buildFeatureEnabledRolesFromEnv,
};
