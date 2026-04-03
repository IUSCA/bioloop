/**
 * Feature flags: build-time role lists (Vite `import.meta.env`) and runtime checks.
 *
 * Role-gated features are declared in `@/config` as `{ defaultRoles }`;
 * comma-separated override env var names are defined in {@link ROLES_LIST_ENV_BY_FEATURE}.
 *
 * @module services/features
 */

/**
 * Valid roles for role-gated features.
 *
 * @type {string[]}
 */
const VALID_ROLES = ["admin", "operator", "user"];

/**
 * Maps feature keys to `VITE_*_ENABLED_FOR_ROLES` env names used when
 * `VITE_FEATURE_ROLE_OVERRIDES` does not supply that feature.
 *
 * @type {Record<string, string>}
 */
const ROLES_LIST_ENV_BY_FEATURE = {
  notifications: "VITE_NOTIFICATIONS_ENABLED_FOR_ROLES",
  import: "VITE_IMPORT_ENABLED_FOR_ROLES",
  uploads: "VITE_UPLOADS_ENABLED_FOR_ROLES",
  auto_create_project_on_dataset_creation:
    "VITE_AUTO_CREATE_PROJECT_ENABLED_FOR_ROLES",
};

/**
 * Parses a comma-separated role list from a Vite env var.
 *
 * @param {string} envVarName - Key on `import.meta.env` (e.g. `VITE_IMPORT_ENABLED_FOR_ROLES`).
 * @param {string[]} defaultRoles - Used when the env var is missing or empty.
 * @returns {string[]} Allowed roles only (`admin`, `operator`, `user`), in env order.
 * @private
 */
function parseEnabledRoles(envVarName, defaultRoles) {
  const raw = import.meta.env[envVarName];
  if (raw == null) return defaultRoles;
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter((role) => VALID_ROLES.includes(role));
}

/**
 * Reads `VITE_FEATURE_ROLE_OVERRIDES` when `VITE_ALLOW_FEATURE_ROLE_OVERRIDES === "1"`.
 *
 * @returns {Record<string, unknown>} Parsed object, or `{}` if disabled, empty, or invalid.
 * @private
 */
function parseFeatureRoleOverrides() {
  if (import.meta.env.VITE_ALLOW_FEATURE_ROLE_OVERRIDES !== "1") return {};
  const raw = import.meta.env.VITE_FEATURE_ROLE_OVERRIDES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_err) {
    console.error(
      "Invalid VITE_FEATURE_ROLE_OVERRIDES JSON; ignoring override",
    );
    return {};
  }
}

/**
 * Resolves which roles may use a role-gated feature at build time.
 *
 * Precedence (highest to lowest):
 * - JSON override entry for `featureKey` (when allow-flag is on),
 * - comma-separated env from {@link ROLES_LIST_ENV_BY_FEATURE},
 * - `defaultRoles`.
 *
 * Unknown roles in env/JSON are dropped.
 *
 * @param {string} featureKey - Key matching config spec and override JSON keys.
 * @param {string[]} defaultRoles - Code default when no env/override applies.
 * @returns {string[]} Allowed roles for this feature in the built bundle.
 * @private
 */
function resolveEnabledForRoles(featureKey, defaultRoles) {
  const featureRoleOverrides = parseFeatureRoleOverrides();
  const overrideRoles = featureRoleOverrides[featureKey];
  if (Array.isArray(overrideRoles)) {
    return overrideRoles.filter((role) => VALID_ROLES.includes(role));
  }
  const envVar = ROLES_LIST_ENV_BY_FEATURE[featureKey];
  if (envVar == null) {
    return defaultRoles;
  }
  return parseEnabledRoles(envVar, defaultRoles);
}

/**
 * Expands the declarative `enabledFeatures` spec from config into the shape
 * consumed by the app and {@link isFeatureEnabled}.
 *
 * - `true` / `false` pass through unchanged.
 * - `{ defaultRoles }` becomes `{ enabledForRoles }` after env/JSON resolution.
 * - `null` / `undefined` entries are skipped.
 * - Invalid entries log an error and are omitted from the result.
 *
 * @param {Record<string, boolean | { defaultRoles: string[] } | null | undefined>} spec
 * @returns {Record<string, boolean | { enabledForRoles: string[] }>}
 */
export function resolveEnabledFeatures(spec) {
  const out = {};
  for (const [key, value] of Object.entries(spec)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "object" && Array.isArray(value.defaultRoles)) {
      out[key] = {
        enabledForRoles: resolveEnabledForRoles(key, value.defaultRoles),
      };
    } else {
      console.error(`Invalid enabledFeatures entry for "${key}"`);
    }
  }
  return out;
}

/**
 * Whether the current user may use a feature, given resolved `enabledFeatures`.
 *
 * - Falsy `featureKey` → `true` (no gate).
 * - Missing `enabledFeatures` → `true`.
 * - Unknown `featureKey` → `true` (same as undefined in config).
 * - Boolean feature → that value.
 * - Object feature → `true` if `hasRole` matches any entry in `enabledForRoles`;
 *   empty array → `false`.
 *
 * @param {string} featureKey - Key under `config.enabledFeatures`.
 * @param {(role: string) => boolean} hasRole - Typically auth store `hasRole`.
 * @param {Record<string, boolean | { enabledForRoles: string[] }> | null | undefined} enabledFeatures
 *   Resolved map from {@link resolveEnabledFeatures}.
 * @returns {boolean}
 */
export function isFeatureEnabled(featureKey, hasRole, enabledFeatures) {
  if (!featureKey) {
    return true;
  }

  if (!enabledFeatures) {
    return true;
  }

  const featureEnabled = enabledFeatures[featureKey];

  if (featureEnabled == null) {
    return true;
  }

  if (typeof featureEnabled === "boolean") {
    return featureEnabled;
  }

  if (typeof featureEnabled !== "object") {
    return false;
  }

  if (!Array.isArray(featureEnabled.enabledForRoles)) {
    return false;
  }

  if (featureEnabled.enabledForRoles.length === 0) {
    return false;
  }

  return featureEnabled.enabledForRoles.some((role) => hasRole(role));
}
