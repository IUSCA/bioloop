const {
  Prisma,
  RESOURCE_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const { SYSTEM_PRINCIPAL_GROUP_IDS, PUBLIC_GROUP_ID } = require('@/constants');
const prisma = require('@/db');
const accessTypeClosure = require('./accessTypeClosure');

// The system principals every signed-in user belongs to, as a SQL VALUES-style union arm.
// A grant to either is honoured for any signed-in user: `Public` is the wider audience of
// the two, so it includes the authenticated one.
// @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
const SYSTEM_PRINCIPALS_SQL = Prisma.raw(
  SYSTEM_PRINCIPAL_GROUP_IDS.map((id) => `SELECT '${id}'`).join(' UNION '),
);

/**
 * The set of subject ids a caller's grants may be addressed to.
 *
 * The containment runs one way only. `Public` is the wider audience, so a signed-in caller
 * holds grants made to `Public` and to `Authenticated Users`. An unauthenticated caller
 * holds only what was granted to `Public`, and widening the set for them would hand out
 * every grant an admin meant for signed-in users.
 *
 * An unauthenticated caller arrives as the `Public` principal itself, which is a group row
 * rather than a user, so it has no memberships to expand.
 * @see docs/design/groups/profiles.md — The anonymous principal
 *
 * @param {string} subject_id - a user's subject id, or PUBLIC_GROUP_ID for an anonymous caller
 * @returns {Prisma.Sql} the body of a `subjects` CTE, selecting one `subject_id` column
 */
function subjectSetSql(subject_id) {
  if (subject_id === PUBLIC_GROUP_ID) {
    return Prisma.sql`SELECT ${PUBLIC_GROUP_ID} AS subject_id`;
  }
  return Prisma.sql`
      SELECT ${subject_id} AS subject_id
      UNION
      SELECT group_id
      FROM effective_user_groups
      WHERE user_id = ${subject_id}
      UNION
      ${SYSTEM_PRINCIPALS_SQL}`;
}

/**
 * Helper to build SQL query for fetching grants or access types for a user and dataset, including via group membership and collection-level grants
 * @param {string} user_id - UUID of the user
 * @param {string} dataset_id - UUID of the dataset
 * @param {Object} [options]
 * @param {string} [options.return_type] - 'grants' (default) or 'access_types' - whether to return full grant records or just distinct access types
 * @param {string[]} [options.access_types] - Optional filter to only return grants with these access types
 * @returns {Prisma.sql} SQL query to fetch the desired data
 */
function userDatasetsQuery(user_id, dataset_id, { return_type = 'grants', access_types = [] } = {}) {
  // find grants for a user and dataset, including grants via group membership and collection-level grants
  // grant - user, dataset
  // grant - user, collection containing dataset
  // grant - group (user is an effective member), dataset
  // grant - group (user is an effective member), collection containing dataset

  const select_fields = return_type === 'access_types'
    ? Prisma.sql`distinct gat.name AS access_type`
    : Prisma.sql`G.*, gat.name AS access_type`;

  const access_type_filter = access_types && access_types.length > 0
    ? Prisma.sql`gat.name IN (${Prisma.join(access_types)})`
    : Prisma.empty;

  const whereClause = access_type_filter !== Prisma.empty ? Prisma.sql`WHERE ${access_type_filter}` : Prisma.empty;

  // cSpell: ignore rsrc gat
  return Prisma.sql`
    WITH subjects AS (
      ${subjectSetSql(user_id)}
    ),
    resources AS (
        SELECT ${dataset_id} AS resource_id
        UNION
        SELECT collection_id
        FROM active_collection_dataset
        WHERE dataset_id = ${dataset_id}
    )
    SELECT ${select_fields}
    FROM valid_grants g
    JOIN subjects s ON g.subject_id = s.subject_id
    JOIN resources rsrc ON g.resource_id = rsrc.resource_id
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    ${whereClause}
`;
}

/**
 * Helper to build SQL query for fetching grants or access types for a user and collection, including via group membership
 * @param {string} user_id - UUID of the user
 * @param {string} collection_id - UUID of the collection
 * @param {Object} [options]
 * @param {string} [options.return_type] - 'grants' (default) or 'access_types' - whether to return full grant records or just distinct access types
 * @param {string[]} [options.access_types] - Optional filter to only return grants with these access types
 * @returns {Prisma.sql} SQL query to fetch the desired data
 */
function userCollectionsQuery(user_id, collection_id, { return_type = 'grants', access_types = [] } = {}) {
  // find grants for a user and collection, including grants via group membership
  // grant - user, collection
  // grant - group (user is member), collection

  const select_fields = return_type === 'access_types'
    ? Prisma.sql`distinct gat.name AS access_type`
    : Prisma.sql`G.*, gat.name AS access_type`;

  const access_type_filter = access_types && access_types.length > 0
    ? Prisma.sql`AND gat.name IN (${Prisma.join(access_types)})`
    : Prisma.empty;

  return Prisma.sql`
    WITH subjects AS (
      ${subjectSetSql(user_id)}
    )
    SELECT ${select_fields}
    FROM valid_grants g
    JOIN subjects s ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    WHERE g.resource_id = ${collection_id}
    ${access_type_filter}
`;
}

/**
 * Helper to build SQL query for fetching all valid grants for a user, including via group membership
 * @param {string} user_id - UUID of the user
 * @returns {Prisma.sql} SQL query to fetch all valid grants for the user
 */
function userValidGrantsQuery(user_id, access_types = []) {
  // helper to find all valid grants for a user, including via group membership
  const access_type_filter = access_types.length > 0
    ? Prisma.sql`gat.name IN (${Prisma.join(access_types)})`
    : Prisma.empty;
  const whereClause = access_type_filter !== Prisma.empty ? Prisma.sql`WHERE ${access_type_filter}` : Prisma.empty;

  return Prisma.sql`
    WITH subjects AS (
      ${subjectSetSql(user_id)}
    )
    SELECT g.*
    FROM valid_grants g
    JOIN subjects s ON g.subject_id = s.subject_id
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    ${whereClause}
  `;
}

/**
 * Helper to build SQL query for fetching owner group ids of resources that a user has grants on
 * @param {string} user_id - UUID of the user
 * @returns {Prisma.sql} SQL query to fetch owner group ids of resources accessible by the user via grants
 */
function ownerGroupIdsOfResourcesAccessibleByUserQuery(user_id) {
  return Prisma.sql`
    WITH user_valid_grants AS (
      ${userValidGrantsQuery(user_id)}
    )
    -- directly join all grants to datasets; if a grant resource is not dataset, 
    -- the join will remove the row, so we only get grants that are on datasets
    SELECT DISTINCT d.owner_group_id as id
    FROM user_valid_grants g
    JOIN dataset d ON g.resource_id = d.resource_id
    WHERE d.owner_group_id IS NOT NULL
    
    UNION
    
    SELECT DISTINCT c.owner_group_id as id
    FROM user_valid_grants g
    JOIN collection c ON g.resource_id = c.id
    WHERE c.owner_group_id IS NOT NULL
  `;
}

/**
 * Helper to build SQL query for fetching collections that are accessible by a user via grants (directly or via group membership)
 * @param {string} user_id - UUID of the user
 * @returns {Prisma.sql} SQL query to fetch collections accessible by the user via grants
 */
function accessibleCollectionsByGrantsQuery(user_id, access_types = []) {
  // helper to find collections that are accessible by a user via grants (directly or via group membership)
  return Prisma.sql`
    SELECT DISTINCT c.id
    FROM (${userValidGrantsQuery(user_id, access_types)}) g
    JOIN collection c ON g.resource_id = c.id
  `;
}

/** Helper to build SQL query for fetching datasets that are accessible by a user via grants
 * (directly or via group membership, including via collection-level grants)
 *
 * Only grants of `access_types` count. A caller that lists datasets passes the types that
 * satisfy `DATASET:VIEW_METADATA`, so every row it shows is one the dataset page will open.
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 * @param {string} user_id - UUID of the user
 * @param {string[]} access_types - the grant types that count. Required: counting every type
 *   admits datasets the user cannot open, such as those under a bare COLLECTION:LIST_CONTENTS.
 * @returns {Prisma.sql} SQL query to fetch dataset resource ids accessible by the user via grants
 */
function accessibleDatasetIdsByGrantsQuery(user_id, access_types) {
  if (!access_types?.length) {
    throw new Error('accessibleDatasetIdsByGrantsQuery needs the access types that count');
  }
  return Prisma.sql`
    WITH valid_grants AS (
      ${userValidGrantsQuery(user_id, access_types)}
    )
    SELECT DISTINCT d.resource_id
    FROM valid_grants g
    JOIN dataset d ON g.resource_id = d.resource_id
    UNION
    SELECT DISTINCT cd.dataset_id as resource_id
    FROM valid_grants g
    JOIN collection c ON g.resource_id = c.id
    JOIN active_collection_dataset cd ON cd.collection_id = c.id
  `;
}

/**
 * Get grants for a user and dataset, including grants via group membership and collection-level grants
 * @param {string} user_id - UUID of the user
 * @param {string} dataset_id - UUID of the dataset
 * @param {Object} [options]
 * @param {string[]} [options.access_types] - Optional filter to only return grants with these access types
 * @returns {Promise<Object[]>} List of grants the user has for the dataset (including via groups and collections)
 */
async function getUserDatasetGrants(user_id, dataset_id, { access_types } = {}) {
  // grant - user, dataset
  // grant - user, collection containing dataset
  // grant - group (user is member), dataset
  // grant - group (user is member), collection containing dataset

  const sql = userDatasetsQuery(user_id, dataset_id, { return_type: 'grants', access_types });
  return prisma.$queryRaw(sql);
}

/**
 * Get all active grant access types for a user on any resource type in a single query.
 * Returns a Set<string> for O(1) membership tests inside policy evaluate() functions.
 * Covers direct-user grants, group-membership grants, and (for datasets) collection-level grants.
 *
 * @param {string}   user_id       - UUID of the user
 * @param {string}   resource_id   - UUID of the dataset or collection
 * @param {'DATASET'|'COLLECTION'} resource_type
 * @returns {Promise<Set<string>>} Set of active access-type names (e.g. {'view_metadata','download'})
 */
async function getGrantAccessTypesForUser(user_id, resource_id, resource_type) {
  const sql = resource_type === RESOURCE_TYPE.COLLECTION
    ? userCollectionsQuery(user_id, resource_id, { return_type: 'access_types' })
    : userDatasetsQuery(user_id, resource_id, { return_type: 'access_types' });

  // console.log(sql.sql, sql.values); // log the generated SQL and values for debugging
  const results = await prisma.$queryRaw(sql);

  // Widen the holding: somebody granted DATASET:DOWNLOAD also has DATASET:LIST_FILES and
  // DATASET:VIEW_METADATA, and the caller is asking what this user can do.
  // @see docs/design/groups/decisions.md — 7. Access types imply one another
  return accessTypeClosure.expand(results.map((r) => r.access_type));
}

/**
 * Check whether a user has at least one active grant for the specified resource and access type(s), including via group membership and collection-level grants
 * @param {string} user_id - UUID of the user
 * @param {string} resource_id - UUID of the dataset or collection
 * @param {'DATASET'|'COLLECTION'} resource_type
 * @param {string[]} access_types - List of access types to check (e.g. ['view_metadata','download'])
 * @returns {Promise<boolean>} Whether the user has at least one matching grant
 */
async function userHasGrant({
  user_id, resource_type, resource_id, access_types,
}) {
  // An empty requirement is an under-specified question, not "any grant". `satisfiedBy([])`
  // returns [] and the query builders read an empty list as no filter, so without this a call
  // that forgot its types would answer true for any holding at all.
  // @see docs/design/groups/access-model-verification-plan.md — Refusal of an under-specified question
  if (!Array.isArray(access_types) || access_types.length === 0) {
    throw new Error('userHasGrant requires at least one access type');
  }
  // Widen the requirement, not the holding: a check for DATASET:VIEW_METADATA is satisfied
  // by a grant of DATASET:DOWNLOAD, so the SQL filter asks for every type that implies one
  // of the requested ones. One query, no extra round trip.
  // @see docs/design/groups/decisions.md — 7. Access types imply one another
  const satisfying = await accessTypeClosure.satisfiedBy(access_types);

  const sql = resource_type === RESOURCE_TYPE.COLLECTION
    ? userCollectionsQuery(user_id, resource_id, { return_type: 'access_types', access_types: satisfying })
    : userDatasetsQuery(user_id, resource_id, { return_type: 'access_types', access_types: satisfying });

  // console.log(sql.sql, sql.values); // log the generated SQL and values for debugging
  const results = await prisma.$queryRaw(sql);
  return results.length > 0;
}

/**
 * Helper to get the owner group ID for a resource (dataset or collection)
 * @param {*} tx - Prisma transaction
 * @param {string} resource_id - UUID of the resource
 * @returns {Promise<string|null>} Owner group ID, or null if not found
 */
async function getResourceOwnerGroupId(tx, resource_id) {
  const resource = await tx.resource.findUnique({
    where: { id: resource_id },
    include: { collection: true, dataset: true },
  });
  if (!resource) return null;
  if (resource.type === RESOURCE_TYPE.DATASET) {
    return resource.dataset.owner_group_id;
  }
  if (resource.type === RESOURCE_TYPE.COLLECTION) {
    return resource.collection.owner_group_id;
  }
  return null;
}

function isAccessTypeOfType(accessTypeName, typePrefix) {
  return accessTypeName.startsWith(`${typePrefix}:`);
}

function isAccessTypeApplicableToResourceType(accessTypeName, resourceType) {
  if (resourceType === RESOURCE_TYPE.DATASET) {
    return isAccessTypeOfType(accessTypeName, 'DATASET');
  }
  if (resourceType === RESOURCE_TYPE.COLLECTION) {
    return isAccessTypeOfType(accessTypeName, 'DATASET') || isAccessTypeOfType(accessTypeName, 'COLLECTION');
  }
  return false;
}

async function assertGrantItemsApplicableToResourceType(tx, resourceType, items) {
  const db = tx || prisma;
  const accessTypeIds = new Set();
  const presetIds = new Set();

  for (const item of items) {
    if (item.access_type_id) accessTypeIds.add(item.access_type_id);
    if (item.preset_id) presetIds.add(item.preset_id);
  }

  const accessTypeById = new Map(
    (accessTypeIds.size > 0
      ? await db.grant_access_type.findMany({
        where: { id: { in: [...accessTypeIds] } },
        select: { id: true, name: true },
      })
      : []
    ).map((t) => [t.id, t.name]),
  );

  for (const item of items) {
    if (item.access_type_id) {
      const typeName = accessTypeById.get(item.access_type_id);
      if (!typeName) {
        throw createError.BadRequest(`access_type_id ${item.access_type_id} does not exist`);
      }
      if (!isAccessTypeApplicableToResourceType(typeName, resourceType)) {
        throw createError.BadRequest(`access_type ${typeName} not valid for resource type ${resourceType}`);
      }
    }
  }

  if (presetIds.size > 0) {
    const presets = await db.grant_preset.findMany({
      where: { id: { in: [...presetIds] }, is_active: true },
      include: {
        access_type_items: {
          include: {
            access_type: true,
          },
        },
      },
    });

    const existingPresetIds = new Set(presets.map((preset) => preset.id));
    for (const presetId of presetIds) {
      if (!existingPresetIds.has(presetId)) {
        throw createError.BadRequest(`preset_id ${presetId} does not exist or is not active`);
      }
    }

    for (const preset of presets) {
      if (!preset.resource_types.includes(resourceType)) {
        throw createError.BadRequest(`preset_id ${preset.id} is not applicable to resource type ${resourceType}`);
      }
    }
  }
}

/**
 * Refuses access request items that name a type only an admin grants, whether directly or
 * through a preset. Throws a 400 naming the type.
 *
 * Runs after `assertGrantItemsApplicableToResourceType`, which refuses unknown ids.
 * @param {object} [tx] - Prisma transaction; defaults to the shared client
 * @param {Array<{access_type_id?: number, preset_id?: number}>} items
 * @see docs/design/groups/ui-information-architecture.md — Access types in forms
 */
async function assertItemsRequestable(tx, items) {
  const db = tx || prisma;
  const accessTypeIds = items.map((item) => item.access_type_id).filter(Boolean);
  const presetIds = items.map((item) => item.preset_id).filter(Boolean);

  const [grantOnlyTypes, grantOnlyPresetItems] = await Promise.all([
    accessTypeIds.length > 0
      ? db.grant_access_type.findMany({
        where: { id: { in: accessTypeIds }, is_requestable: false },
        select: { name: true },
      })
      : [],
    presetIds.length > 0
      ? db.grant_preset_item.findMany({
        where: { preset_id: { in: presetIds }, access_type: { is_requestable: false } },
        select: { preset: { select: { name: true } }, access_type: { select: { name: true } } },
      })
      : [],
  ]);

  if (grantOnlyTypes.length > 0) {
    const names = grantOnlyTypes.map((t) => t.name).join(', ');
    throw createError.BadRequest(
      `access_type ${names} cannot be requested; an admin of the owning group grants it directly`,
    );
  }
  if (grantOnlyPresetItems.length > 0) {
    const [first] = grantOnlyPresetItems;
    throw createError.BadRequest(
      `preset ${first.preset.name} includes ${first.access_type.name}, which cannot be requested`,
    );
  }
}

module.exports = {
  userHasGrant,
  subjectSetSql,
  ...accessTypeClosure,
  // grants to a user for a dataset
  getUserDatasetGrants,
  getGrantAccessTypesForUser,

  // resource compatibility helpers
  isAccessTypeApplicableToResourceType,
  assertGrantItemsApplicableToResourceType,
  assertItemsRequestable,

  // sql queries
  ownerGroupIdsOfResourcesAccessibleByUserQuery,
  accessibleCollectionsByGrantsQuery,
  accessibleDatasetIdsByGrantsQuery,
  getResourceOwnerGroupId,
};
