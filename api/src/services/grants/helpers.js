const {
  Prisma,
  RESOURCE_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const { EVERYONE_GROUP_ID } = require('@/constants');
const prisma = require('@/db');

const EVERYONE_GROUP_ID_SQL = Prisma.raw(`'${EVERYONE_GROUP_ID}'`);

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
      SELECT ${user_id} AS subject_id
      UNION
      SELECT group_id
      FROM effective_user_groups
      WHERE user_id = ${user_id}
      UNION
      SELECT ${EVERYONE_GROUP_ID_SQL}
    ),
    resources AS (
        SELECT ${dataset_id} AS resource_id
        UNION
        SELECT collection_id
        FROM collection_dataset
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
      SELECT ${user_id} AS subject_id
      UNION
      SELECT group_id
      FROM effective_user_groups
      WHERE user_id = ${user_id}
      UNION
      SELECT ${EVERYONE_GROUP_ID_SQL}
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
function userValidGrantsQuery(user_id) {
  // helper to find all valid grants for a user, including via group membership
  return Prisma.sql`
    WITH subjects AS (
      SELECT ${user_id} AS subject_id
      UNION
      SELECT group_id
      FROM effective_user_groups
      WHERE user_id = ${user_id}
      UNION
      SELECT ${EVERYONE_GROUP_ID_SQL}
    )
    SELECT g.*
    FROM valid_grants g
    JOIN subjects s ON g.subject_id = s.subject_id
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
function accessibleCollectionsByGrantsQuery(user_id) {
  // helper to find collections that are accessible by a user via grants (directly or via group membership)
  return Prisma.sql`
    SELECT DISTINCT c.id
    FROM (${userValidGrantsQuery(user_id)}) g
    JOIN collection c ON g.resource_id = c.id
  `;
}

/** Helper to build SQL query for fetching datasets that are accessible by a user via grants
 * (directly or via group membership, including via collection-level grants)
 * @param {string} user_id - UUID of the user
 * @returns {Prisma.sql} SQL query to fetch dataset resource ids accessible by the user via grants
 */
function accessibleDatasetIdsByGrantsQuery(user_id) {
  return Prisma.sql`
    WITH valid_grants AS (
      ${userValidGrantsQuery(user_id)}
    )
    SELECT DISTINCT d.resource_id
    FROM valid_grants g
    JOIN dataset d ON g.resource_id = d.resource_id
    UNION
    SELECT DISTINCT cd.dataset_id as resource_id
    FROM valid_grants g
    JOIN collection c ON g.resource_id = c.id
    JOIN collection_dataset cd ON cd.collection_id = c.id
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
  return new Set(results.map((r) => r.access_type));
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
  const sql = resource_type === RESOURCE_TYPE.COLLECTION
    ? userCollectionsQuery(user_id, resource_id, { return_type: 'access_types', access_types })
    : userDatasetsQuery(user_id, resource_id, { return_type: 'access_types', access_types });

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

module.exports = {
  userHasGrant,
  // grants to a user for a dataset
  getUserDatasetGrants,
  getGrantAccessTypesForUser,

  // resource compatibility helpers
  isAccessTypeApplicableToResourceType,
  assertGrantItemsApplicableToResourceType,

  // sql queries
  ownerGroupIdsOfResourcesAccessibleByUserQuery,
  accessibleCollectionsByGrantsQuery,
  accessibleDatasetIdsByGrantsQuery,
  getResourceOwnerGroupId,
};
