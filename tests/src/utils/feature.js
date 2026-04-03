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
 *
 * @example
 * parseRoles('admin,user');
 * // => ['admin', 'user']
 *
 * @example
 * parseRoles('foo,bar');
 * // => ['admin', 'operator', 'user']
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
 * Reads and parses `E2E_TARGET_ROLES` from `process.env`.
 *
 * If the env var is missing or resolves to no valid roles, all supported roles
 * are returned so Playwright still runs a complete matrix by default.
 *
 * @returns {string[]} Normalized target roles for project generation.
 *
 * @example
 * process.env.E2E_TARGET_ROLES = 'operator,user';
 * createTargetRoles();
 * // => ['operator', 'user']
 *
 * @example
 * delete process.env.E2E_TARGET_ROLES;
 * createTargetRoles();
 * // => ['admin', 'operator', 'user']
 */
function createTargetRoles() {
  return parseRoles(process.env.E2E_TARGET_ROLES);
}

/**
 * Parses per-feature role-list env vars (comma-separated) with an explicit
 * empty-string escape hatch.
 *
 * Behavior:
 * - `undefined` or `null` => use `defaultRoles`
 * - `''` (after trim) => feature enabled for nobody
 * - otherwise => keep only known roles
 *
 * @param {string | undefined} value - Raw env value such as `admin,operator`.
 * @param {string[]} defaultRoles - Fallback roles when env var is unset.
 * @returns {string[]} Sanitized list of known roles.
 *
 * @example
 * parseFeatureRoles('admin,operator', ['admin']);
 * // => ['admin', 'operator']
 *
 * @example
 * parseFeatureRoles('', ['admin']);
 * // => []
 *
 * @example
 * parseFeatureRoles(undefined, ['admin']);
 * // => ['admin']
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
 * Parses JSON feature-role overrides from environment.
 *
 * Overrides are only considered when `VITE_ALLOW_FEATURE_ROLE_OVERRIDES ===
 * '1'`. Invalid JSON or non-object JSON safely falls back to `{}`.
 *
 * @returns {Record<string, unknown>} Parsed override object keyed by feature.
 *
 * @example
 * process.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES = '1';
 * process.env.VITE_FEATURE_ROLE_OVERRIDES = '{"import":["admin","operator"]}';
 * parseFeatureRoleOverrides();
 * // => { import: ['admin', 'operator'] }
 *
 * @example
 * process.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES = '0';
 * parseFeatureRoleOverrides();
 * // => {}
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
 * @param {string} options.featureKey - Key in JSON override object (for example `uploads`,
 * `notifications`, etc.).
 * @param {string} options.rolesListEnvVar - Fallback comma-list env var name.
 * @param {string[]} options.defaultRoles - Fallback roles if no env value is set.
 * @returns {string[]} Enabled roles for the feature.
 *
 * @example
 * // JSON override path wins:
 * process.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES = '1';
 * process.env.VITE_FEATURE_ROLE_OVERRIDES = '{"uploads":["admin","user"]}';
 * getFeatureEnabledRolesFromEnv({
 *   featureKey: 'uploads',
 *   rolesListEnvVar: 'VITE_UPLOADS_ENABLED_FOR_ROLES',
 *   defaultRoles: ['admin'],
 * });
 * // => ['admin', 'user']
 *
 * @example
 * // Fallback comma-list path:
 * process.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES = '0';
 * process.env.VITE_UPLOADS_ENABLED_FOR_ROLES = 'admin,operator';
 * getFeatureEnabledRolesFromEnv({
 *   featureKey: 'uploads',
 *   rolesListEnvVar: 'VITE_UPLOADS_ENABLED_FOR_ROLES',
 *   defaultRoles: ['admin'],
 * });
 * // => ['admin', 'operator']
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
 *
 * @example
 * // With defaults and no override env:
 * buildFeatureEnabledRolesFromEnv();
 * // => {
 * //   import: ['admin'],
 * //   uploads: ['admin'],
 * //   notifications: [],
 * // }
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
