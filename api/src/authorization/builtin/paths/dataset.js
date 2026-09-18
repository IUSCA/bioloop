const { Prisma } = require('@prisma/client');

const { idFilter, typeFilter, kindFilter } = require('./sql');

/**
 * The path rows from a user to datasets. Five SELECTs joined by UNION ALL, one row per path:
 *
 * 1. `admin`: the user has an active ADMIN membership in the dataset's owning group.
 * 2. `oversight`: the owning group is one the user oversees, from
 *    `effective_user_oversight_groups`. `group_id` is the owning group.
 * 3. `grant` on the dataset: a valid grant on the dataset itself, held by any subject in
 *    `subjects` (the user, their groups, or a system principal), with a `DATASET:` type.
 * 4. `grant` through a collection: the same, but the grant is on a collection that currently
 *    contains the dataset. `collection_id` names that collection.
 * 5. `member`: the user effectively belongs to the owning group, and that group allows user
 *    contributions. `direct` is true when the membership is in the owning group itself, not
 *    a descendant.
 *
 * Reads the `subjects` CTE that `accessPathsQuery` defines.
 *
 * @param {string} userId
 * @param {Object} options
 * @param {string[]|null} options.resourceIds - limits every SELECT to these dataset resource ids
 * @param {string[]|null} options.accessTypes - limits the grant rows to these type names
 * @returns {Prisma.Sql}
 */
function datasetPaths(userId, { resourceIds, accessTypes }) {
  return Prisma.sql`
    SELECT d.resource_id, 'admin' AS path_kind, gu.group_id, NULL::text AS grant_id,
      NULL::text AS collection_id, NULL::text AS access_type, NULL::boolean AS direct
    FROM dataset d
    JOIN active_group_user gu ON gu.group_id = d.owner_group_id AND gu.user_id = ${userId} AND gu.role = 'ADMIN'
    WHERE TRUE ${idFilter('d.resource_id', resourceIds)}
    UNION ALL
    SELECT d.resource_id, 'oversight', o.group_id, NULL, NULL, NULL, NULL
    FROM dataset d
    JOIN effective_user_oversight_groups o ON o.group_id = d.owner_group_id AND o.user_id = ${userId}
    WHERE TRUE ${idFilter('d.resource_id', resourceIds)}
    UNION ALL
    SELECT d.resource_id, 'grant', NULL, g.id, NULL, gat.name, NULL
    FROM subjects s
    JOIN valid_grants g ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON gat.id = g.access_type_id
    JOIN dataset d ON d.resource_id = g.resource_id
    WHERE TRUE ${idFilter('d.resource_id', resourceIds)} ${typeFilter(accessTypes)} ${kindFilter('DATASET')}
    UNION ALL
    SELECT cd.dataset_id, 'grant', NULL, g.id, cd.collection_id, gat.name, NULL
    FROM subjects s
    JOIN valid_grants g ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON gat.id = g.access_type_id
    JOIN active_collection_dataset cd ON cd.collection_id = g.resource_id
    WHERE TRUE ${idFilter('cd.dataset_id', resourceIds)} ${typeFilter(accessTypes)} ${kindFilter('DATASET')}
    UNION ALL
    SELECT DISTINCT d.resource_id, 'member', e.group_id, NULL, NULL, NULL,
      EXISTS (SELECT 1 FROM active_group_user m WHERE m.group_id = e.group_id AND m.user_id = ${userId})
    FROM dataset d
    JOIN "group" og ON og.id = d.owner_group_id AND og.allow_user_contributions
    JOIN effective_user_groups e ON e.group_id = d.owner_group_id AND e.user_id = ${userId}
    WHERE TRUE ${idFilter('d.resource_id', resourceIds)}
  `;
}

module.exports = {
  resourceType: 'dataset',
  sql: datasetPaths,
  // A create names only its owning group, so its paths are that group's rows of these kinds.
  prospectiveKinds: ['admin', 'oversight', 'member'],
};
