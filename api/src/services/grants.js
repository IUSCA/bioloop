/**
 * Grant Service
 * Manages durable authorization facts
 */

const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { EVERYONE_GROUP_ID } = require('@/constants');

// ============================================================================
// Grant Creation
// ============================================================================

async function _createGrant(tx, data, granted_by) {
  const grant = await tx.grant.create({
    data: {
      subject_type: data.subject_type,
      subject_id: data.subject_id,
      resource_type: data.resource_type,
      resource_id: data.resource_id,
      access_type_id: data.access_type_id,
      valid_from: data.valid_from ?? Prisma.skip,
      valid_until: data.valid_until ?? Prisma.skip,
      granted_by,
      justification: data.justification ?? Prisma.skip,
    },
  });

  // create audit record for grant creation
  await tx.authorization_audit.create({
    data: {
      event_type: AUTH_EVENT_TYPE.GRANT_CREATED,
      actor_id: granted_by,
      target_type: 'grant',
      target_id: grant.id,
    },
  });

  return grant;
}

/**
 * Create a grant (direct authorization)
 * @param {Object} data
 * @param {string} data.subject_type - 'USER' or 'GROUP'
 * @param {string} data.subject_id - User ID or Group ID
 * @param {string} data.resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} data.resource_id
 * @param {string} data.access_type_id - GRANT_ACCESS_TYPE enum
 * @param {Date} [data.valid_from] - Defaults to now
 * @param {Date} [data.valid_until] - Expiration date
 * @param {number} granted_by - Actor user ID
 * @param {string} [data.justification] - Optional justification for the grant creation
 * @returns {Promise<Object>} Created grant
 */
async function createGrant(data, granted_by, txn = null) {
  if (txn) {
    return _createGrant(txn, data, granted_by);
  }
  return prisma.$transaction((tx) => _createGrant(tx, data, granted_by));
}

/**
 * Create grants in a batch for multiple access types (one for each access type) - useful for access request approvals.
 * Each grant will be created in a single transaction, so either all succeed or all fail.
 * @param {Object} data
 * @param {string} data.subject_type - 'USER' or 'GROUP'
 * @param {string} data.subject_id - User ID or Group ID
 * @param {string} data.resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} data.resource_id
 * @param {string[]} data.access_types - GRANT_ACCESS_TYPE enum
 * @param {Date} [data.valid_from] - Defaults to now
 * @param {Date} [data.valid_until] - Expiration date
 * @param {number} granted_by - Actor user ID
 * @param {string} [data.justification] - Optional justification for the grant creation
 * @returns {Promise<Object>} Created grants
 */
async function createGrantsBatch(data) {
  return prisma.$transaction(async (tx) => {
    const createdGrants = await tx.grant.createManyAndReturn({
      data: data.access_types.map((access_type) => ({
        subject_type: data.subject_type,
        subject_id: data.subject_id,
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        access_type,
        valid_from: data.valid_from ?? Prisma.skip,
        valid_until: data.valid_until ?? Prisma.skip,
        granted_by: data.granted_by,
        justification: data.justification ?? Prisma.skip,
      })),
      select: {
        id: true,
      },
    });

    // create audit records for each created grant
    await tx.authorization_audit.createMany({
      data: createdGrants.map((grant) => ({
        event_type: AUTH_EVENT_TYPE.GRANT_CREATED,
        actor_id: data.granted_by,
        target_type: 'grant',
        target_id: grant.id,
      })),
    });

    return createdGrants;
  });
}

/**
 * Revoke a grant
 * @param {string} grant_id
 * @param {number} actor_id
 * @param {string} [reason] - Optional revocation reason
 * @returns {Promise<Object>} Revoked grant
 */
async function revokeGrant(grant_id, { actor_id, reason }) {
  return prisma.$transaction(async (tx) => {
    const revokedGrant = await tx.grant.update({
      where: { id: grant_id },
      data: {
        revoked: true,
        revoked_by: actor_id,
        justification: reason ?? Prisma.skip,
      },
    });

    // create audit record for grant revocation
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_REVOKED,
        actor_id,
        target_type: 'grant',
        target_id: revokedGrant.id,
      },
    });

    return revokedGrant;
  });
}

/**
 * Helper to build SQL query for fetching grants or access types for a user and dataset, including via group membership and collection-level grants
 * @param {number} user_id
 * @param {string} dataset_id
 * @param {Object} [options]
 * @param {string} [options.return_type] - 'grants' (default) or 'access_types' - whether to return full grant records or just distinct access types
 * @param {string[]} [options.access_types] - Optional filter to only return grants with these access types
 * @returns {Prisma.sql} SQL query to fetch the desired data
 */
function userDatasetsQuery(user_id, dataset_id, { return_type = 'grants', access_types } = {}) {
  // find grants for a user and dataset, including grants via group membership and collection-level grants
  // grant - user, dataset
  // grant - user, collection containing dataset
  // grant - group (user is member), dataset
  // grant - group (user is member), collection containing dataset

  // group transitive membership: (not implemented here)
  // it implies that if a user is not a direct member of a group that has a grant,
  // but is direct member of descendant group that has no grant,
  // still should get the grant via the ancestor group.

  const select_fields = return_type === 'access_types'
    ? Prisma.sql`distinct gat.name AS access_type`
    : Prisma.sql`G.*, gat.name AS access_type`;

  const access_type_filter = access_types && access_types.length > 0
    ? Prisma.sql`AND gat.name IN (${Prisma.join(access_types)})`
    : Prisma.empty;

  return Prisma.sql`
    WITH user_groups AS (
      SELECT DISTINCT group_id 
      FROM effective_user_groups 
      WHERE user_id = ${user_id} 
      UNION SELECT ${EVERYONE_GROUP_ID} -- include everyone group
    ),
    collections_having_dataset AS (
      SELECT collection_id
      FROM collection_datasets
      WHERE dataset_id = ${dataset_id}
    )
    SELECT ${select_fields}
    FROM valid_grants G
    JOIN grant_access_type gat ON G.access_type_id = gat.id
    WHERE (
        (
          G.subject_type = 'USER' AND G.subject_id = ${user_id} 
          AND G.resource_type = 'DATASET' AND G.resource_id = ${dataset_id}
        )
        OR (
          G.subject_type = 'USER' AND G.subject_id = ${user_id} 
          AND G.resource_type = 'COLLECTION' AND G.resource_id IN (SELECT collection_id FROM collections_having_dataset)
        )
        OR (
          G.subject_type = 'GROUP' AND G.subject_id IN (SELECT group_id FROM user_groups) 
          AND G.resource_type = 'DATASET' AND G.resource_id = ${dataset_id}
        )
        OR (
          G.subject_type = 'GROUP' AND G.subject_id IN (SELECT group_id FROM user_groups) 
          AND G.resource_type = 'COLLECTION' AND G.resource_id IN (SELECT collection_id FROM collections_having_dataset)
        )
      )
      ${access_type_filter}
  `;
}

// Similar helper for collections
function userCollectionsQuery(user_id, collection_id, { return_type = 'grants', access_types } = {}) {
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
    WITH user_groups AS (
      SELECT DISTINCT group_id 
      FROM effective_user_groups 
      WHERE user_id = ${user_id} 
      UNION SELECT ${EVERYONE_GROUP_ID} -- include everyone group
    )
    SELECT ${select_fields}
    FROM valid_grants G
    JOIN grant_access_type gat ON G.access_type_id = gat.id
    WHERE (
        (
          G.subject_type = 'USER' AND G.subject_id = ${user_id} 
          AND G.resource_type = 'COLLECTION' AND G.resource_id = ${collection_id}
        )
        OR (
          G.subject_type = 'GROUP' AND G.subject_id IN (SELECT group_id FROM user_groups) 
          AND G.resource_type = 'COLLECTION' AND G.resource_id = ${collection_id}
        )
      )
      ${access_type_filter}
  `;
}

function userValidGrantsQuery(user_id) {
  // helper to find all valid grants for a user, including via group membership
  return Prisma.sql`
    SELECT *
    FROM valid_grants g
    WHERE g.subject_type = 'USER'
      AND g.subject_id = ${user_id}::text

    UNION

    SELECT g.*
    FROM valid_grants g
    WHERE g.subject_type = 'GROUP'
      AND (
            g.subject_id = ${EVERYONE_GROUP_ID}
            OR g.subject_id IN (
                  SELECT group_id
                  FROM effective_user_groups
                  WHERE user_id = ${user_id}
              )
          )
  `;
}

function ownerGroupIdsOfResourcesAccessibleByUserQuery(user_id) {
  // helper to find owner group ids of resources that a user has grants on
  return Prisma.sql`
    WITH user_valid_grants AS (
      ${userValidGrantsQuery(user_id)}
    )
    SELECT DISTINCT d.owner_group_id as id
    FROM user_valid_grants g
    JOIN dataset d ON g.resource_type = 'DATASET' AND g.resource_id = d.id
    WHERE d.owner_group_id IS NOT NULL
    
    UNION
    
    SELECT DISTINCT c.owner_group_id as id
    FROM user_valid_grants g
    JOIN collection c ON g.resource_type = 'COLLECTION' AND g.resource_id = c.id
    WHERE c.owner_group_id IS NOT NULL
  `;
}

function accessibleCollectionsByGrantsQuery(user_id) {
  // helper to find collections that are accessible by a user via grants (directly or via group membership)
  return Prisma.sql`
    SELECT DISTINCT c.*
    FROM (${userValidGrantsQuery(user_id)}) g
    JOIN collection c ON g.resource_type = 'COLLECTION' AND g.resource_id = c.id
  `;
}

/**
 * Get grants for a user and dataset, including grants via group membership and collection-level grants
 * @param {number} user_id
 * @param {string} dataset_id
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
 * * Get access types for a user and dataset via grants (including group and collection grants)
 * @param {number} user_id
 * @param {string} dataset_id
 * @returns {Promise<string[]>} List of access types the user has for the dataset
 */
async function getUserDatasetAccessTypes(user_id, dataset_id) {
  const sql = userDatasetsQuery(user_id, dataset_id, { return_type: 'access_types' });
  const results = await prisma.$queryRaw(sql);
  return results.map((r) => r.access_type);
}

async function userHasGrant({
  user_id, resource_type, resource_id, access_types,
}) {
  if (resource_type === 'COLLECTION') {
    // check if user has grant for the collection directly or via group membership
    const sql = userCollectionsQuery(
      user_id,
      resource_id,
      { return_type: 'access_types', access_types },
    );
    const results = await prisma.$queryRaw(sql);
    return results.length > 0;
  }
  const sql = userDatasetsQuery(user_id, resource_id, { return_type: 'access_types', access_types });

  const results = await prisma.$queryRaw(sql);
  return results.length > 0;
}

async function getGrantById(grant_id) {
  return prisma.grant.findUnique({
    where: { id: grant_id },
  });
}

function getPrismaGrantValidityFilter(active) {
  const where = {};
  if (active !== undefined && active !== null) {
    if (active === true) {
      where.revoked_at = null;
      where.valid_from = { lte: new Date() };
      where.OR = [
        { valid_until: null },
        { valid_until: { gt: new Date() } },
      ];
    } else if (active === false) {
      where.OR = [
        { revoked_at: { not: null } },
        { valid_from: { gt: new Date() } },
        { valid_until: { lte: new Date() } },
      ];
    }
  }
  return where;
}

async function listGrantsForSubject({
  subject_type, subject_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    subject_type,
    subject_id: subject_id.toString(),
  };
  Object.assign(where, getPrismaGrantValidityFilter(active));

  const data = await prisma.grant.findMany({
    where,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.grant.count({
    where,
  });
  return {
    metadata: {
      total,
      offset,
      limit,
    },
    data,
  };
}

async function listGrantsForResource({
  resource_type, resource_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    resource_type,
    resource_id: resource_id.toString(),
  };
  Object.assign(where, getPrismaGrantValidityFilter(active));
  const data = await prisma.grant.findMany({
    where,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.grant.count({
    where,
  });
  return {
    metadata: {
      total,
      offset,
      limit,
    },
    data,
  };
}

async function listAccessTypes() {
  return prisma.grant_access_type.findMany({
    orderBy: {
      name: 'asc',
    },
  });
}

module.exports = {
  createGrant,
  createGrantsBatch,
  revokeGrant,

  // grants to a user for a dataset
  getUserDatasetGrants,
  getUserDatasetAccessTypes,

  // existence check for a grant to a user for a resource and access type(s)
  userHasGrant,

  // sql queries
  ownerGroupIdsOfResourcesAccessibleByUserQuery,
  accessibleCollectionsByGrantsQuery,

  // get grant
  getGrantById,
  listGrantsForSubject,
  listGrantsForResource,
  listAccessTypes,
};
