/**
 * Grant Service
 * Manages durable authorization facts
 */

const {
  Prisma, GRANT_CREATION_TYPE, GRANT_REVOCATION_TYPE, RESOURCE_TYPE,
  GROUP_MEMBER_ROLE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { resolveEntityName, resolveGrant } = require('@/authorization/builtin/audit/helpers');
const { EVERYONE_GROUP_ID } = require('@/constants');
const { TARGET_TYPE } = require('@/authorization/builtin/audit');
const { enumToSql } = require('@/utils/sql');

const EVERYONE_GROUP_ID_SQL = Prisma.raw(`'${EVERYONE_GROUP_ID}'`);
const GRANT_INCLUDES = {
  resource: {
    include: {
      dataset: true,
      collection: true,
    },
  },
  subject: {
    include: {
      user: true,
      group: true,
    },
  },
  access_type: true,
  grantor: true,
  revoker: true,
};

// ============================================================================
// Grant Creation
// ============================================================================

const GRANT_OVERLAP_ERROR_MSG = 'An active grant with overlapping validity already exists'
  + ' for this subject, resource, and access type';

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
  // Capture the issuing authority (owner group of the resource at grant creation time)
  const issuing_authority_id = await getResourceOwnerGroupId(tx, data.resource_id);

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
        issuing_authority_id: issuing_authority_id ?? Prisma.skip,
        source_access_request_id: data.source_access_request_id ?? Prisma.skip,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientUnknownRequestError && e.message.includes('grant_no_overlap')) {
      throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
    }
    throw e;
  }

  // create audit record for grant creation
  const actorName = await resolveEntityName(tx, 'user', granted_by);
  const fullGrant = await resolveGrant(tx, grant.id);

  await tx.authorization_audit.create({
    data: {
      event_type: AUTH_EVENT_TYPE.GRANT_CREATED,
      actor_id: granted_by,
      actor_name: actorName,
      subject_id: fullGrant.subject_id,
      subject_name: fullGrant.subject.name,
      subject_type: fullGrant.subject.type,
      metadata: {
        resource_id: fullGrant.resource_id,
        resource_type: fullGrant.resource.type,
        resource_name: fullGrant.resource.name,
        access_type_name: fullGrant.access_type.name,
      },
      target_type: TARGET_TYPE.GRANT,
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
    // Fetch the grant to get resource_id for authority capture
    const grantToRevoke = await tx.grant.findUniqueOrThrow({
      where: { id: grant_id },
      select: { resource_id: true, revoked_at: true },
    });
    if (grantToRevoke.revoked_at !== null) {
      throw createError.NotFound('Grant not found or already revoked');
    }

    // Capture the revoking authority (owner group of the resource at revocation time)
    const revoking_authority_id = await getResourceOwnerGroupId(tx, grantToRevoke.resource_id);

    const revokedGrant = await tx.grant.update({
      where: { id: grant_id, revoked_at: null }, // only allow revocation of non-revoked grants
      data: {
        revoked_at: new Date(),
        revoked_by: actor_id,
        revocation_reason: reason ?? Prisma.skip,
        revocation_type: GRANT_REVOCATION_TYPE.MANUAL,
        revoking_authority_id: revoking_authority_id ?? Prisma.skip,
      },
    });

    // create audit record for grant revocation
    const actorName = await resolveEntityName(tx, 'user', actor_id);
    const fullGrant = await resolveGrant(tx, revokedGrant.id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_REVOKED,
        actor_id,
        actor_name: actorName,
        subject_id: fullGrant.subject_id,
        subject_name: fullGrant.subject.name,
        subject_type: fullGrant.subject.type,
        metadata: {
          resource_id: fullGrant.resource_id,
          resource_type: fullGrant.resource.type,
          resource_name: fullGrant.resource.name,
          access_type_name: fullGrant.access_type.name,
        },
        target_type: TARGET_TYPE.GRANT,
        target_id: fullGrant.id,
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
 * Get a grant by ID
 * @param {string} grant_id - UUID of the grant
 * @returns {Promise<Object>} Grant record or null if not found
 */
async function getGrantById(grant_id) {
  return prisma.grant.findUnique({
    where: { id: grant_id },
    include: GRANT_INCLUDES,
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

  const dataPromise = prisma.grant.findMany({
    where,
    include: GRANT_INCLUDES,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const totalPromise = prisma.grant.count({
    where,
  });
  const [data, total] = await Promise.all([dataPromise, totalPromise]);
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
 * List grants for a subject grouped by resource_id (no sort; offset/limit on groups)
 * @param {Object} params
 * @param {string} params.subject_id
 */
async function listGrantsForSubjectGrouped({
  subject_id,
}) {
  const sql = Prisma.sql`
    SELECT
      g.resource_id,
      json_agg(json_build_object(
        'id', g.id,
        'access_type_id', g.access_type_id,
        'access_type_name', gat.name,
        'valid_from', g.valid_from,
        'valid_until', g.valid_until,
        'revoked_at', g.revoked_at
      )) AS grants
    FROM valid_grants g
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    WHERE g.subject_id = ${subject_id}
    GROUP BY g.resource_id
    ORDER BY MAX(g.created_at) ASC -- sort groups by most recent grant creation time
  `;

  const rows = await prisma.$queryRaw(sql);

  // hydrate resource details for each grant group
  const resourceIds = rows.map((r) => r.resource_id);
  const resources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
    include: {
      dataset: true,
      collection: true,
    },
  });
  const resourcesById = new Map(resources.map((r) => [r.id, r]));

  const grantsGrouped = rows.map((row) => {
    const resource = resourcesById.get(row.resource_id);
    return {
      resource,
      grants: row.grants,
    };
  });
  return grantsGrouped;
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
  const dataPromise = prisma.grant.findMany({
    where,
    include: GRANT_INCLUDES,
    skip: offset,
    take: limit,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const totalPromise = prisma.grant.count({
    where,
  });
  const [data, total] = await Promise.all([dataPromise, totalPromise]);
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
 * List grants for a resource grouped by subject_id (no sort; offset/limit on groups)
 * @param {Object} params
 * @param {string} params.resource_id
 */
async function listGrantsForResourceGrouped({
  resource_id,
}) {
  const sql = Prisma.sql`
    SELECT
      g.subject_id,
      json_agg(json_build_object(
        'id', g.id,
        'access_type_id', g.access_type_id,
        'access_type_name', gat.name,
        'valid_from', g.valid_from,
        'valid_until', g.valid_until,
        'revoked_at', g.revoked_at
      )) AS grants
    FROM valid_grants g
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    WHERE g.resource_id = ${resource_id}
    GROUP BY g.subject_id
    ORDER BY MAX(g.created_at) ASC -- sort groups by most recent grant creation time
  `;

  const rows = await prisma.$queryRaw(sql);

  // hydrate subject details for each grant group
  const subjectIds = rows.map((r) => r.subject_id);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    include: {
      user: true,
      group: true,
    },
  });
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  const grantsGrouped = rows.map((row) => {
    const subject = subjectsById.get(row.subject_id);
    return {
      subject,
      grants: row.grants,
    };
  });
  return grantsGrouped;
}

async function listAccessTypes() {
  return prisma.grant_access_type.findMany({
    orderBy: {
      name: 'asc',
    },
  });
}

/**
 * List all active grant presets with their access types
 * @returns {Promise<Array>} List of active presets with nested access_type_items
 */
async function listPresets() {
  return prisma.grant_preset.findMany({
    where: { is_active: true },
    include: {
      access_type_items: {
        include: {
          access_type: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

async function _hydrateSubjectsAndResources(data) {
  const subjectIds = [...new Set(data.map((row) => row.subject_id))];
  const resourceIds = [...new Set(data.map((row) => row.resource_id))];
  const [subjects, resources] = await Promise.all([
    prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: {
        id: true, type: true, user: true, group: true,
      },
    }),
    prisma.resource.findMany({
      where: { id: { in: resourceIds } },
      select: {
        id: true, type: true, dataset: true, collection: true,
      },
    }),
  ]);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const resourcesById = new Map(resources.map((r) => [r.id, r]));

  const grantsGrouped = data.map((row) => ({
    subject: subjectsById.get(row.subject_id),
    resource: resourcesById.get(row.resource_id),
    grants: row.grants,
  }));
  return grantsGrouped;
}

/**
 * List all grants that are expiring within a certain number of days
 * @param {Object} params
 * @param {number} params.within_days - Number of days until expiration to filter by (e.g. 30 to find grants expiring within the next 30 days)
 * @returns {Promise<Object>} Paginated list of grants expiring within the specified time frame
 */
async function listExpiringGrants({
  within_days,
}) {
  // filters valid grants that are expiring soon
  // groups by subject_id and resource_id, aggregates access types into an array,
  // and sorts by soonest expiring grant in the group
  const sql = Prisma.sql`
    SELECT
      g.subject_id,
      g.resource_id,
      json_agg(
        json_build_object(
          'id', g.id,
          'access_type_id', g.access_type_id,
          'access_type_name', at.name,
          'valid_from', g.valid_from,
          'valid_until', g.valid_until
        )
        ORDER BY g.valid_until ASC
      ) AS grants
    FROM valid_grants g
    JOIN grant_access_type at
      ON at.id = g.access_type_id
    WHERE g.valid_until IS NOT NULL
      AND g.valid_until <= NOW() + (INTERVAL '1 day' * ${within_days})
    GROUP BY g.subject_id, g.resource_id
    ORDER BY MIN(g.valid_until) ASC
  `;

  const data = await prisma.$queryRaw(sql);

  // hydrate subject and resource details for each grant group
  const grantsGrouped = await _hydrateSubjectsAndResources(data);

  return grantsGrouped;
}

/**
 * List all grants that are expiring within a certain number of days on resources that are owned by groups that user is an admin of
 * @param {Object} params
 * @param {string} params.user_id - UUID of the user
 * @param {number} params.within_days - Number of days until expiration to filter by (e.g. 30 to find grants expiring within the next 30 days)
 * @returns {Promise<Object>} Paginated list of grants expiring within the specified time frame
 */
async function listExpiringGrantsForAdmin({
  user_id,
  within_days,
}) {
  const sql = Prisma.sql`
      WITH admin_groups AS (
        SELECT gu.group_id
        FROM group_user gu
        WHERE gu.user_id = ${user_id}
          AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
      ),
      owned_resources AS (
        SELECT d.resource_id AS resource_id
        FROM dataset d
        JOIN admin_groups ag ON d.owner_group_id = ag.group_id

        UNION

        SELECT c.id AS resource_id
        FROM collection c
        JOIN admin_groups ag ON c.owner_group_id = ag.group_id
      )
      SELECT 
        g.subject_id,
        g.resource_id,
        json_agg(
          json_build_object(
            'id', g.id,
            'access_type_id', g.access_type_id,
            'access_type_name', at.name,
            'valid_from', g.valid_from,
            'valid_until', g.valid_until
          )
          ORDER BY g.valid_until ASC
        ) AS grants
      FROM valid_grants g
      JOIN owned_resources r ON g.resource_id = r.resource_id
      JOIN grant_access_type at ON at.id = g.access_type_id
      WHERE g.valid_until IS NOT NULL
        AND g.valid_until <= NOW() + INTERVAL '1 day' * ${within_days}
      GROUP BY g.subject_id, g.resource_id
      ORDER BY MIN(g.valid_until) ASC
    `;

  const data = await prisma.$queryRaw(sql);

  // hydrate subject and resource details for each grant group
  const grantsGrouped = await _hydrateSubjectsAndResources(data);

  return grantsGrouped;
}

async function listMyGrants({
  user_id, is_active, resource_id, expiring_within_days,
}) {
  const where = {
    subject_id: user_id,
  };
  Object.assign(where, getPrismaGrantValidityFilter(is_active));
  if (resource_id) {
    where.resource_id = resource_id;
  }
  if (expiring_within_days != null) {
    where.valid_until = {
      lte: new Date(Date.now() + expiring_within_days * 24 * 60 * 60 * 1000),
    };
  }

  return prisma.grant.findMany({
    where,
    include: {
      resource: {
        include: {
          dataset: true,
          collection: true,
        },
      },
      access_type: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
}

module.exports = {
  GRANT_OVERLAP_ERROR_MSG,

  createGrant,
  revokeGrant,

  // grants to a user for a dataset
  getUserDatasetGrants,
  getGrantAccessTypesForUser,

  // existence check for a grant to a user for a resource and access type(s)
  userHasGrant,

  // sql queries
  ownerGroupIdsOfResourcesAccessibleByUserQuery,
  accessibleCollectionsByGrantsQuery,
  accessibleDatasetIdsByGrantsQuery,

  // get grant
  getGrantById,
  listGrantsForSubject,
  listGrantsForResource,
  listGrantsForSubjectGrouped,
  listGrantsForResourceGrouped,
  listAccessTypes,
  listPresets,
  listExpiringGrants,
  listExpiringGrantsForAdmin,
  getPrismaGrantValidityFilter,
  listMyGrants,
};
