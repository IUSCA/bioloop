const KNOWN_ROLES = new Set(["admin", "operator", "user"]);
const DEFAULT_UPLOAD_ENABLED_ROLES = ["admin"];

/**
 * Normalizes a comma-separated string or array of role names.
 * Unknown and duplicate roles are ignored so a malformed instance setting
 * cannot accidentally grant access.
 */
export function parseEnabledRoles(
  value,
  fallback = DEFAULT_UPLOAD_ENABLED_ROLES,
) {
  const values = Array.isArray(value) ? value : value?.split(",");
  if (!values) return [...fallback];

  const roles = values
    .map((role) => String(role).trim().toLowerCase())
    .filter((role, index, allRoles) => {
      return KNOWN_ROLES.has(role) && allRoles.indexOf(role) === index;
    });

  return roles.length > 0 ? roles : [...fallback];
}

const runtimeConfig = window["__BIOLOOP_CONFIG__"] ?? {};

export const uploadEnabledForRoles = parseEnabledRoles(
  runtimeConfig.uploadEnabledRoles ?? import.meta.env.VITE_UPLOAD_ENABLED_ROLES,
);
