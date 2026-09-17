const { Prisma } = require('@prisma/client');

const { idFilter, typeFilter, kindFilter } = require('./sql');

/**
 * The path rows from a user to collections. Three SELECTs joined by UNION ALL, one row per path:
 *
 * 1. `admin`: the user has an active ADMIN membership in the collection's owning group.
 * 2. `oversight`: the owning group is one the user oversees, from
 *    `effective_user_oversight_groups`. `group_id` is the owning group.
 * 3. `grant`: a valid grant on the collection, held by any subject in `subjects`, with a
 *    `COLLECTION:` type.
 *
 * There is no `member` row: belonging to the owning group confers nothing on its collections.
 * Reads the `subjects` CTE that `accessPathsQuery` defines.
 *
 * @param {string} userId
 * @param {Object} options
 * @param {string[]|null} options.resourceIds - limits every SELECT to these collection ids
 * @param {string[]|null} options.accessTypes - limits the grant rows to these type names
 * @returns {Prisma.Sql}
 */
function collectionPaths(userId, { resourceIds, accessTypes }) {
  return Prisma.sql`
    SELECT c.id AS resource_id, 'admin' AS path_kind, gu.group_id, NULL::text AS grant_id,
      NULL::text AS collection_id, NULL::text AS access_type, NULL::boolean AS direct
    FROM collection c
    JOIN active_group_user gu ON gu.group_id = c.owner_group_id AND gu.user_id = ${userId} AND gu.role = 'ADMIN'
    WHERE TRUE ${idFilter('c.id', resourceIds)}
    UNION ALL
    SELECT c.id, 'oversight', o.group_id, NULL, NULL, NULL, NULL
    FROM collection c
    JOIN effective_user_oversight_groups o ON o.group_id = c.owner_group_id AND o.user_id = ${userId}
    WHERE TRUE ${idFilter('c.id', resourceIds)}
    UNION ALL
    SELECT c.id, 'grant', NULL, g.id, NULL, gat.name, NULL
    FROM subjects s
    JOIN valid_grants g ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON gat.id = g.access_type_id
    JOIN collection c ON c.id = g.resource_id
    WHERE TRUE ${idFilter('c.id', resourceIds)} ${typeFilter(accessTypes)} ${kindFilter('COLLECTION')}
  `;
}

module.exports = {
  resourceType: 'collection',
  sql: collectionPaths,
  // A create names only its owning group, so its paths are that group's rows of these kinds.
  prospectiveKinds: ['admin', 'oversight'],
};
