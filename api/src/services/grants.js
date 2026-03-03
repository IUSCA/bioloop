/**
 * Grant Service
 * Manages durable authorization facts
 */

const {
  Prisma, GRANT_CREATION_TYPE, SUBJECT_TYPE, RESOURCE_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { EVERYONE_GROUP_ID } = require('@/constants');
const { enumToSql } = require('@/utils/sql');

const EVERYONE_GROUP_ID_SQL = Prisma.raw(`'${EVERYONE_GROUP_ID}'`);

// ============================================================================
// Grant Creation
// ============================================================================

const GRANT_OVERLAP_ERROR_MSG = 'An active grant with overlapping validity already exists'
  + ' for this subject, resource, and access type';

/**
 * Check whether a non-revoked grant already exists that would overlap with the requested validity window.
 * Uses half-open interval semantics [valid_from, valid_until) matching the DB exclusion constraint.
 * Kept as an explicit pre-flight helper for callers that want early ORM-level feedback before hitting the DB.
 */
// eslint-disable-next-line no-unused-vars
async function _assertNoOverlappingGrant(tx, data) {
  const newFrom = data.valid_from ? new Date(data.valid_from) : new Date();
  const newUntil = data.valid_until ? new Date(data.valid_until) : null;

  // Overlap condition for [newFrom, newUntil) vs [existingFrom, existingUntil):
  //   existingFrom < newUntil  (infinity if newUntil is null → always true)
  //   newFrom < existingUntil  (infinity if existingUntil is null → always true)
  const conflicting = await tx.grant.findFirst({
    where: {
      subject_id: data.subject_id,
      resource_id: data.resource_id,
      access_type_id: Number(data.access_type_id),
      revoked_at: null,
      AND: [
        // existingFrom < newUntil (skip if newUntil is null → ∞, so always overlaps)
        ...(newUntil ? [{ valid_from: { lt: newUntil } }] : []),
        // newFrom < existingUntil (existingUntil null → ∞, so always overlaps)
        {
          OR: [
            { valid_until: null },
            { valid_until: { gt: newFrom } },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (conflicting) {
    throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
  }
}

async function _createGrant(tx, data, granted_by) {
  let grant;
  try {
    grant = await tx.grant.create({
      data: {
        subject_id: data.subject_id,
        resource_id: data.resource_id,
        access_type_id: data.access_type_id,
        creation_type: data.creation_type ?? GRANT_CREATION_TYPE.MANUAL,
        valid_from: data.valid_from ?? Prisma.skip,
        valid_until: data.valid_until ?? Prisma.skip,
        granted_by,
        justification: data.justification ?? Prisma.skip,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientUnknownRequestError && e.message.includes('grant_no_overlap')) {
      throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
    }
    throw e;
  }

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
 * @param {string} data.subject_id - UUID of either user of group
 * @param {string} data.resource_id - UUID of either dataset or collection
 * @param {string} data.access_type_id - GRANT_ACCESS_TYPE enum
 * @param {Date} [data.valid_from] - Defaults to now
 * @param {Date} [data.valid_until] - Expiration date
 * @param {string} [data.creation_type] - GRANT_CREATION_TYPE enum, defaults to MANUAL
 * @param {string} granted_by - UUID of the user performing the grant
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
 * Revoke a grant
 * @param {string} grant_id - UUID of the grant to revoke
 * @param {string} actor_id - UUID of the user performing the revocation
 * @param {string} [reason] - Optional revocation reason
 * @returns {Promise<Object>} Revoked grant
 */
async function revokeGrant(grant_id, { actor_id, reason }) {
  return prisma.$transaction(async (tx) => {
    // if a grant with given id is not found or already revoked
    // PrismaClientKnownRequestError with code 'P2025' will be thrown
    // this error is caught and re-thrown as 404 Not Found by the route handler, which is the desired behavior
    const revokedGrant = await tx.grant.update({
      where: { id: grant_id, revoked_at: null }, // only allow revocation of non-revoked grants
      data: {
        revoked_at: new Date(),
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
    WITH user_groups AS (
      SELECT DISTINCT group_id 
      FROM effective_user_groups 
      WHERE user_id = ${user_id} 
      UNION SELECT ${EVERYONE_GROUP_ID_SQL} -- include everyone group
    )
    SELECT ${select_fields}
    FROM valid_grants G
    JOIN resource r ON G.resource_id = r.id
    JOIN subject s ON G.subject_id = s.id
    JOIN grant_access_type gat ON G.access_type_id = gat.id
    WHERE (
        (
          s.type = ${enumToSql(SUBJECT_TYPE.USER)} AND G.subject_id = ${user_id}
          AND r.type = ${enumToSql(RESOURCE_TYPE.COLLECTION)} AND G.resource_id = ${collection_id}
        )
        OR (
          s.type = ${enumToSql(SUBJECT_TYPE.GROUP)} AND G.subject_id IN (SELECT group_id FROM user_groups) 
          AND r.type = ${enumToSql(RESOURCE_TYPE.COLLECTION)} AND G.resource_id = ${collection_id}
        )
      )
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
    SELECT *
    FROM valid_grants g
    JOIN subject s ON g.subject_id = s.id
    WHERE s.type = ${enumToSql(SUBJECT_TYPE.USER)}
      AND g.subject_id = ${user_id}

    UNION

    SELECT g.*
    FROM valid_grants g
    JOIN subject s ON g.subject_id = s.id
    WHERE s.type = ${enumToSql(SUBJECT_TYPE.GROUP)}
      AND (
            g.subject_id = ${EVERYONE_GROUP_ID_SQL}
            OR g.subject_id IN (
                  SELECT group_id
                  FROM effective_user_groups
                  WHERE user_id = ${user_id}
              )
          )
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
    SELECT DISTINCT c.*
    FROM (${userValidGrantsQuery(user_id)}) g
    JOIN collection c ON g.resource_id = c.id
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
async function getUserGrantAccessTypesForUser(user_id, resource_id, resource_type) {
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
 * Get a grant by ID
 * @param {string} grant_id - UUID of the grant
 * @returns {Promise<Object>} Grant record or null if not found
 */
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

/**
 * List grants for a subject (user or group) with optional filtering by active status and pagination/sorting
 * @param {Object} params
 * @param {string} params.subject_id - UUID of the user or group
 * @param {boolean} [params.active] - If true, only return active grants; if false, only return inactive grants; if omitted, return all grants
 * @param {number} [params.offset] - Pagination offset
 * @param {number} [params.limit] - Pagination limit
 * @param {string} [params.sort_by] - Field to sort by (e.g. 'created_at')
 * @param {'asc'|'desc'} [params.sort_order] - Sort order
 * @returns {Promise<Object>} Paginated list of grants matching the criteria
 */
async function listGrantsForSubject({
  subject_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    subject_id,
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

/**
 * List grants for a resource (dataset or collection) with optional filtering by active status and pagination/sorting
 * @param {Object} params
 * @param {string} params.resource_id - UUID of the dataset or collection
 * @param {boolean} [params.active] - If true, only return active grants; if false, only return inactive grants; if omitted, return all grants
 * @param {number} [params.offset] - Pagination offset
 * @param {number} [params.limit] - Pagination limit
 * @param {string} [params.sort_by] - Field to sort by (e.g. 'created_at')
 * @param {'asc'|'desc'} [params.sort_order] - Sort order
 * @returns {Promise<Object>} Paginated list of grants matching the criteria
 */
async function listGrantsForResource({
  resource_id,
  active,
  offset,
  limit,
  sort_by,
  sort_order,
}) {
  const where = {
    resource_id,
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
  revokeGrant,

  // grants to a user for a dataset
  getUserDatasetGrants,
  getUserGrantAccessTypesForUser,

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
