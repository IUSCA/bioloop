const { Prisma } = require('@prisma/client');

const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const { idFilter, typeFilter } = require('./sql');

/**
 * The path rows from a user to groups. Four SELECTs joined by UNION ALL, one row per path:
 *
 * 1. `admin`: the user has an active ADMIN membership in the group itself. Being admin of a
 *    parent gives no `admin` row here.
 * 2. `oversight`: the group is one the user oversees, from `effective_user_oversight_groups`.
 * 3. `member`: the user effectively belongs to the group. `direct` is true when the membership
 *    is in the group itself, not a descendant.
 * 4. `grant`: a valid grant, held by any subject in `subjects`, on a dataset or collection the
 *    group owns. The row's `resource_id` and `group_id` are the owning group. Grants held by a
 *    system principal, such as Public, are left out. The type's kind is not checked, because
 *    the grant is on the owned resource, not on the group.
 *
 * Reads the `subjects` CTE that `accessPathsQuery` defines.
 *
 * @param {string} userId
 * @param {Object} options
 * @param {string[]|null} options.resourceIds - limits every SELECT to these group ids
 * @param {string[]|null} options.accessTypes - limits the grant rows to these type names
 * @returns {Prisma.Sql}
 */
function groupPaths(userId, { resourceIds, accessTypes }) {
  return Prisma.sql`
    SELECT gu.group_id AS resource_id, 'admin' AS path_kind, gu.group_id, NULL::text AS grant_id,
      NULL::text AS collection_id, NULL::text AS access_type, NULL::boolean AS direct
    FROM active_group_user gu
    WHERE gu.user_id = ${userId} AND gu.role = 'ADMIN' ${idFilter('gu.group_id', resourceIds)}
    UNION ALL
    SELECT o.group_id, 'oversight', o.group_id, NULL, NULL, NULL, NULL
    FROM effective_user_oversight_groups o
    WHERE o.user_id = ${userId} ${idFilter('o.group_id', resourceIds)}
    UNION ALL
    SELECT DISTINCT e.group_id, 'member', e.group_id, NULL, NULL, NULL,
      EXISTS (SELECT 1 FROM active_group_user m WHERE m.group_id = e.group_id AND m.user_id = ${userId})
    FROM effective_user_groups e
    WHERE e.user_id = ${userId} ${idFilter('e.group_id', resourceIds)}
    UNION ALL
    SELECT owned.owner_group_id, 'grant', owned.owner_group_id, g.id, NULL, gat.name, NULL
    FROM subjects s
    JOIN valid_grants g ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON gat.id = g.access_type_id
    JOIN (
      SELECT resource_id AS id, owner_group_id FROM dataset
      UNION ALL
      SELECT id, owner_group_id FROM collection
    ) owned ON owned.id = g.resource_id
    WHERE g.subject_id NOT IN (${Prisma.join(SYSTEM_PRINCIPAL_GROUP_IDS)})
      ${idFilter('owned.owner_group_id', resourceIds)} ${typeFilter(accessTypes)}
  `;
}

module.exports = {
  resourceType: 'group',
  sql: groupPaths,
};
