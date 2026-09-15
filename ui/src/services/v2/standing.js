/**
 * The badge a caller's standing shows on a resource.
 *
 * A badge is a display of standing and gates nothing; tabs and buttons gate on capabilities. When
 * a caller holds several paths, the badge shows the first row of the precedence table that
 * matches, and the standing panel lists every path.
 *
 * @see docs/design/groups/access-model.md — The badge vocabulary
 */

/**
 * One row per path kind, in precedence order. `group` is the badge on a group; `resource` is the
 * badge on a dataset or a collection, and `null` means the kind produces no badge there.
 */
export const BADGE_PRECEDENCE = Object.freeze([
  {
    kind: "platform_admin",
    group: "PLATFORM_ADMIN",
    resource: "PLATFORM_ADMIN",
  },
  { kind: "admin", group: "ADMIN", resource: "ADMIN" },
  { kind: "oversight", group: "OVERSIGHT", resource: "OVERSIGHT" },
  { kind: "member", direct: true, group: "MEMBER", resource: null },
  { kind: "member", direct: false, group: "TRANSITIVE_MEMBER", resource: null },
  { kind: "grant", group: "RESOURCE_ACCESS", resource: "GRANT_HOLDER" },
  {
    kind: "resource_rule",
    group: "PROFILE_VIEWER",
    resource: "PROFILE_VIEWER",
  },
]);

const matches = (row, path) =>
  row.kind === path.kind &&
  (row.direct === undefined || row.direct === Boolean(path.direct));

/**
 * @param {Array<{kind: string, direct?: boolean}>} standing - `_meta.standing` from the API
 * @param {"group"|"dataset"|"collection"} resourceType
 * @returns {string|null} a role name `RoleBadge` renders, or null for no badge
 */
export function badgeFor(standing, resourceType) {
  const column = resourceType === "group" ? "group" : "resource";
  const row = BADGE_PRECEDENCE.find(
    (r) => r[column] && (standing ?? []).some((path) => matches(r, path)),
  );
  return row ? row[column] : null;
}

/**
 * The badge a list row shows. A platform admin holds that path on every row, so a list leaves
 * it out and shows the relation the caller has to the row itself.
 *
 * @param {Array<{kind: string, direct?: boolean}>} standing - a row's `_meta.standing`
 * @param {"group"|"dataset"|"collection"} resourceType
 * @returns {string|null}
 */
export function rowBadgeFor(standing, resourceType) {
  return badgeFor(
    (standing ?? []).filter((path) => path.kind !== "platform_admin"),
    resourceType,
  );
}
