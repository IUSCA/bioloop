/**
 * The access rule as one SQL statement: every path by which a user reaches a resource.
 *
 * Each output row is one path, with the columns `resource_id`, `path_kind`, `group_id`,
 * `grant_id`, `collection_id`, `access_type`, and `direct`, which a `member` row sets when the
 * membership is in the group itself rather than a descendant. A list joins on it before paging, a single
 * check binds one resource id, and standing is the set of rows for one resource. Nothing else
 * restates a term.
 *
 * - `admin`: an active ADMIN membership in the owning group, or in the group itself.
 *   Authority does not flow down the tree.
 * - `oversight`: the owning group, or the group itself, is a strict descendant of a group the
 *   user administers.
 * - `member`: the user is an effective member of the group, directly or through a descendant.
 *   On a dataset, only when its owning group accepts contributions: that membership is what
 *   admits `contribute`, and membership alone confers no other dataset path.
 * - `grant`: a valid grant reaching the user, addressed to the user, a group they effectively
 *   belong to, or a system principal, carrying a type of the resource's kind. A dataset is
 *   reached by a grant on itself or on a collection that currently contains it. A group is
 *   reached by a grant on a resource it owns, and grants to a system principal do not count
 *   there.
 *
 * The platform admin, restrictions, projection, and terms that name no resource stay outside
 * the statement.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 * @see docs/design/groups/access-model.md — Paths and standing
 */

const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const { subjectSetSql } = require('@/services/grants/helpers');
const accessTypeClosure = require('@/services/grants/accessTypeClosure');

const RESOURCE_TYPES = ['dataset', 'collection', 'group'];
const PATH_KINDS = ['admin', 'oversight', 'member', 'grant'];

const idFilter = (column, resourceIds) => (resourceIds
  ? Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(resourceIds)})`
  : Prisma.empty);

const typeFilter = (accessTypes) => (accessTypes
  ? Prisma.sql`AND gat.name IN (${Prisma.join(accessTypes)})`
  : Prisma.empty);

/**
 * A grant reaches a resource only through a type of that resource's kind. A collection type
 * never counts for a dataset it contains, and a dataset type granted on a collection confers
 * nothing on the collection itself. The kind is the prefix of the type's name, as in
 * `isAccessTypeApplicableToResourceType`.
 */
const kindFilter = (prefix) => Prisma.sql`AND gat.name LIKE ${`${prefix}:%`}`;

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

const BUILDERS = { dataset: datasetPaths, collection: collectionPaths, group: groupPaths };

/**
 * Builds the SQL that returns every path from one user to resources of one type, one row per
 * path, with the columns described at the top of this file.
 *
 * The statement first defines the `subjects` CTE from `subjectSetSql`: the user, every group they
 * effectively belong to, and the system principals, or only `Public` for an anonymous caller. The
 * grant arms match grants held by any of these. It then
 * appends the type's builder (`datasetPaths`, `collectionPaths`, or `groupPaths`).
 *
 * Nothing runs here. The caller executes the SQL, or embeds it in a larger query.
 *
 * @param {Object} args
 * @param {string} args.userId - a user's subject id, or PUBLIC_GROUP_ID for an anonymous caller
 * @param {'dataset'|'collection'|'group'} args.resourceType
 * @param {string[]} [args.resourceIds] - restrict to these resources; omit for a list
 * @param {string[]} [args.accessTypes] - grant rows only of these types, already widened by
 *   `satisfiedBy`; omit for every type
 * @returns {Prisma.Sql} a statement selecting the path columns, usable as a subquery
 */
function accessPathsQuery({
  userId, resourceType, resourceIds = null, accessTypes = null,
}) {
  const build = BUILDERS[resourceType];
  if (!build) throw new Error(`accessPathsQuery: no paths are defined for resource type ${resourceType}`);
  if (!userId) throw new Error('accessPathsQuery: a user is required');
  if (resourceIds && resourceIds.length === 0) throw new Error('accessPathsQuery: resourceIds is empty');
  if (accessTypes && accessTypes.length === 0) throw new Error('accessPathsQuery: accessTypes is empty');
  return Prisma.sql`
    WITH subjects AS (${subjectSetSql(userId)})
    ${build(userId, { resourceIds, accessTypes })}
  `;
}

/**
 * Builds the SQL that returns the ids of the resources a user can reach, one row per resource.
 *
 * It runs `accessPathsQuery`, keeps the paths whose kind is in `pathKinds`, and returns each
 * remaining `resource_id` once, however many paths reach it. A list search embeds it to limit
 * its rows to what the caller reaches. For example, `pathKinds: ['admin', 'oversight']` returns
 * only the resources the user governs, and ignores their memberships and grants.
 *
 * @param {Object} args - as `accessPathsQuery`, plus the two below
 * @param {string[]} [args.pathKinds] - the path kinds that count; defaults to every kind
 * @param {Prisma.Sql} [args.restrictionPredicate] - an extra condition on each path row `p`;
 *   defaults to `TRUE`
 * @returns {Prisma.Sql} a statement selecting one `resource_id` column
 */
function accessibleIdsQuery({
  pathKinds = PATH_KINDS, restrictionPredicate = Prisma.sql`TRUE`, ...args
}) {
  if (!pathKinds.length) throw new Error('accessibleIdsQuery: pathKinds is empty');
  return Prisma.sql`
    SELECT DISTINCT p.resource_id
    FROM (${accessPathsQuery(args)}) p
    WHERE p.path_kind IN (${Prisma.join(pathKinds)})
      AND ${restrictionPredicate}
  `;
}

/**
 * The path kinds a resource that does not exist yet can have. A create names only its owning
 * group, so it has no grant, and it reaches the resource through that group's rows.
 */
const PROSPECTIVE_KINDS = {
  dataset: ['admin', 'oversight', 'member'],
  collection: ['admin', 'oversight'],
};

/**
 * The `access_paths` value for a set of path rows.
 * @param {Object[]} rows - rows of `accessPathsQuery` for one resource
 * @returns {Promise<{rows: Object[], kinds: Set<string>, access_types: Set<string>}>}
 */
async function summarizePaths(rows) {
  const granted = rows.filter((r) => r.path_kind === 'grant').map((r) => r.access_type);
  return {
    rows,
    kinds: new Set(rows.map((r) => r.path_kind)),
    access_types: await accessTypeClosure.expand(granted),
  };
}

/**
 * One user's paths to one resource, as the builtin terms read them.
 *
 * With a resource id, the rows are `accessPathsQuery` bound to that id. Without one, the check
 * is a create, and the rows are the owning group's `admin`, `oversight`, and `member` rows
 * limited to the kinds in `PROSPECTIVE_KINDS`.
 *
 * @param {Object} id - the context identifiers `{ user, resourceType, resource, prospective }`
 * @returns {Promise<{rows: Object[], kinds: Set<string>, access_types: Set<string>}>}
 *   `access_types` holds the grant rows' types widened through the implication closure.
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */
async function loadAccessPaths({
  user, resourceType, resource, prospective,
}) {
  if (!RESOURCE_TYPES.includes(resourceType)) {
    throw new Error(`access_paths: no paths are defined for resource type ${resourceType}`);
  }
  let rows = [];
  if (user && resource != null) {
    rows = await prisma.$queryRaw(accessPathsQuery({ userId: user, resourceType, resourceIds: [resource] }));
  } else if (user && prospective?.owner_group_id && PROSPECTIVE_KINDS[resourceType]) {
    const groupRows = await prisma.$queryRaw(accessPathsQuery({
      userId: user, resourceType: 'group', resourceIds: [prospective.owner_group_id],
    }));
    rows = groupRows.filter((r) => PROSPECTIVE_KINDS[resourceType].includes(r.path_kind));
  }
  return summarizePaths(rows);
}

/**
 * One user's `access_paths` for each of several resources, from one statement.
 *
 * A list decides every row it returns. Seeding each row's check with its value keeps the list
 * at one path query, and the rows agree with the detail route because the statement is the same.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.resourceType
 * @param {string[]} args.resourceIds - not empty
 * @returns {Promise<Map<string, Object>>} an entry for every id, with no rows where nothing reaches it
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */
async function accessPathsByResource({ userId, resourceType, resourceIds }) {
  const rows = await prisma.$queryRaw(accessPathsQuery({ userId, resourceType, resourceIds }));
  const byId = new Map(resourceIds.map((id) => [id, []]));
  rows.forEach((row) => byId.get(row.resource_id)?.push(row));
  const entries = await Promise.all([...byId].map(async ([id, own]) => [id, await summarizePaths(own)]));
  return new Map(entries);
}

module.exports = {
  accessPathsQuery, accessibleIdsQuery, loadAccessPaths, accessPathsByResource, RESOURCE_TYPES, PATH_KINDS,
};
