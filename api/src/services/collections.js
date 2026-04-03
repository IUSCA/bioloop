const { Prisma, GROUP_MEMBER_ROLE } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');
const { randomUUID } = require('crypto');

const prisma = require('@/db');
const { generate_slug } = require('@/utils/slug');
const audit = require('@/authorization/builtin/audit');

const {
  AUTH_EVENT_TYPE, TARGET_TYPE, AuditBuilder,
} = audit;
const grantService = require('@/services/grants');
const { enumToSql, buildWhereClause, createLikePattern } = require('@/utils/sql');
const { RESOURCE_SCOPES } = require('./resources');

const PRISMA_COLLECTION_INCLUDES = {
  _count: {
    select: { datasets: true },
  },
  owner_group: true,
};
const CONFLICT_ERROR_MESSAGE = 'Collection was updated by another process. Please refresh and try again.';
const ARCHIVED_ERROR_MESSAGE = 'Cannot modify an archived collection.';

function make_slug_unique_fn(tx) {
  return async (_slug) => {
    const existingCollection = await tx.collection.findUnique({
      where: { slug: _slug },
      select: { id: true },
    });
    return !existingCollection;
  };
}

/**
 * Create a collection
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.owner_group_id - Owning group
 * @param {string} [data.description]
 * @param {Object} [data.metadata]
 * @param {string[]} [data.dataset_ids] - Optional array of dataset IDs to add to the collection upon creation. All datasets must exist, not be archived, and have the same owner group as the collection.
 * @param {string} actor_id - UUID of the user creating the collection (must have appropriate permissions)
 * @returns {Promise<Object>} Created collection
 */
async function createCollection(data, { actor_id }) {
  return prisma.$transaction(async (tx) => {
    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    const id = randomUUID();

    // resource row must be created first — collection.id is a direct FK to resource.id
    await tx.resource.create({ data: { id, type: 'COLLECTION' } });

    // create collection
    const createData = {
      id,
      name: data.name,
      slug,
      description: data.description ?? Prisma.skip,
      metadata: data.metadata ?? Prisma.skip,
      owner_group_id: data.owner_group_id,
    };
    if (data.dataset_ids && data.dataset_ids.length > 0) {
      createData.datasets = {
        create: data.dataset_ids?.map((dataset_id) => ({
          dataset_id,
          added_by: actor_id,
        })) ?? [],
      };
    }
    const _collection = await tx.collection.create({
      data: createData,
      include: PRISMA_COLLECTION_INCLUDES,
    });

    // Create audit record for collection creation
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(TARGET_TYPE.COLLECTION, _collection.id, _collection.name)
      .create(tx, AUTH_EVENT_TYPE.COLLECTION_CREATED);

    return _collection;
  });
}

/**
 * Update collection metadata with optimistic concurrency control
 *
 * @param {string} collection_id - ID of the collection to update
 * @param {Object} data - Data for updating the collection
 * @param {string} [data.name] - New name for the collection (optional)
 * @param {string} [data.description] - New description for the collection (optional)
 * @param {Object} [data.metadata] - Metadata updates to merge with existing metadata (optional)
 * @param {number} expected_version - The version of the collection that the client expects to update. Must match the current version in the database for the update to succeed.
 * @returns {Promise<Object>} Updated collection object
 * @throws {createError.Conflict} If the expected_version does not match the current version in the database, indicating a concurrent modification
 */
async function updateCollectionMetadata(collection_id, { data, expected_version }) {
  return prisma.$transaction(async (tx) => {
    let slug;
    const currentCollection = await tx.collection.findUniqueOrThrow({
      where: { id: collection_id },
    });

    // if current collection is archived, prevent any updates
    if (currentCollection.is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

    // if name is being updated, generate a new slug, otherwise keep existing slug
    if (data.name && data.name !== currentCollection.name) {
      slug = await generate_slug({
        name: data.name,
        is_slug_unique_fn: make_slug_unique_fn(tx),
      });
    }

    // deep merge metadata updates into existing metadata if provided
    let mergedMetadata;
    if (data.metadata) {
      mergedMetadata = _.merge(currentCollection.metadata, data.metadata);
    }

    let updatedCollection;
    try {
      updatedCollection = await tx.collection.update({
        where: {
          id: collection_id,
          version: expected_version, // optimistic concurrency control - ensures we're updating the version we expect, and not overwriting someone else's concurrent update
        },
        data: {
          name: data.name ?? Prisma.skip,
          slug: slug ?? Prisma.skip,
          description: data.description ?? Prisma.skip,
          metadata: mergedMetadata ?? Prisma.skip,
          version: { increment: 1 }, // increment version on every update
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError
        && (e.code === 'P2025' || e.code === 'P2015')) {
        throw createError.Conflict(CONFLICT_ERROR_MESSAGE);
      }
      throw e;
    }

    return updatedCollection;
  });
}

/**
 * Archive a collection (soft delete)
 *
 * @param {string} collection_id - UUID of the collection to archive
 * @param {string} actor_id - UUID of the user performing the archival action (must have appropriate permissions)
 * @returns {Promise<Object>} The archived collection object
 */
async function archiveCollection(collection_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    const archivedCollection = await tx.collection.update({
      where: { id: collection_id },
      data: {
        archived_at: new Date(),
        is_archived: true,
      },
    });

    // Create audit record for collection archival
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(TARGET_TYPE.COLLECTION, collection_id)
      .create(tx, AUTH_EVENT_TYPE.COLLECTION_ARCHIVED);

    return archivedCollection;
  });
}

/**
 *  Unarchive a collection
 *
 * @param {string} collection_id - UUID of the collection to unarchive
 * @param {string} actor_id - UUID of the user performing the unarchival action (must have appropriate permissions)
 * @returns {Promise<Object>} The unarchived collection object
 */
async function unarchiveCollection(collection_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    const unarchivedCollection = await tx.collection.update({
      where: { id: collection_id },
      data: {
        archived_at: null,
        is_archived: false,
      },
    });

    // Create audit record for collection unarchival
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(TARGET_TYPE.COLLECTION, collection_id)
      .create(tx, AUTH_EVENT_TYPE.COLLECTION_UNARCHIVED);

    return unarchivedCollection;
  });
}

/**
 * Permanently delete a collection
 *
 * @param {string} collection_id - UUID of the collection to delete
 * @param {string} actor_id - UUID of the user performing the deletion action (must have appropriate permissions)
 * @returns {Promise<Object>} The deleted collection object
 */
async function deleteCollection(collection_id, actor_id) {
  return prisma.$transaction(async (tx) => {
    const deletedCollection = await tx.collection.delete({
      where: { id: collection_id },
    });

    // Create audit record for collection deletion
    const builder = new AuditBuilder(tx, { actor_id });
    await builder
      .setTarget(TARGET_TYPE.COLLECTION, collection_id, deletedCollection.name)
      .create(tx, AUTH_EVENT_TYPE.COLLECTION_DELETED);

    return deletedCollection;
  });
}

/**
 * Add datasets to collection
 * @param {string} collection_id - UUID of the collection
 * @param {string[]} dataset_ids - UUIDs of datasets to add to the collection
 * @param {string} actor_id - UUID of the user performing the action
 * @returns {Promise<Object[]>} Created records
 */
async function addDatasets(collection_id, { dataset_ids, actor_id }) {
  if (!dataset_ids.length) return [];

  // dataset is not archived (is_deleted = false)
  // and dataset owner group is not archived
  // and dataset owner group is the same as collection owner group

  const datasetRows = await prisma.$queryRaw`
    WITH collection_owner AS (
      SELECT owner_group_id FROM collection WHERE id = ${collection_id}
    )
    SELECT d.resource_id
    FROM dataset d
    JOIN "group" g ON d.owner_group_id = g.id
    JOIN collection_owner co ON d.owner_group_id = co.owner_group_id
    WHERE d.resource_id = ANY(${dataset_ids}::text[]) and d.is_deleted = false and g.is_archived = false
  `;
  const validDatasetIds = datasetRows.map((row) => row.resource_id);
  const invalidDatasetIds = dataset_ids.filter((id) => !validDatasetIds.includes(id));
  if (invalidDatasetIds.length) {
    throw createError.BadRequest(
      `The following dataset IDs are invalid for adding to the collection: ${invalidDatasetIds.join(', ')}`
      + ' Datasets must exist, not be archived, and have the same owner group as the collection'
      + ' and the owner group must not be archived.',
    );
  }

  return prisma.$transaction(async (tx) => {
    // Acquire a row-level lock on the collection row.
    // Any concurrent transaction trying to FOR UPDATE the same row will block.
    // So all addDatasets and removeDatasets calls for the same collection_id are serialized.
    const collectionRows = await tx.$queryRaw`
      SELECT is_archived FROM collection
      WHERE id = ${collection_id}
      FOR UPDATE;
    `;
    if (collectionRows.length === 0) {
      throw createError.NotFound('Collection not found');
    }
    const { is_archived } = collectionRows[0];
    if (is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

    const createdRecords = await tx.$queryRaw`
      INSERT INTO collection_dataset (collection_id, dataset_id, added_by)
      SELECT ${collection_id}, dataset_id, ${actor_id}
      FROM UNNEST(${dataset_ids}::text[]) AS dataset_id
      ON CONFLICT DO NOTHING
      RETURNING collection_id, dataset_id;
     `;

    // Create audit records for each added dataset
    if (createdRecords.length > 0) {
      const builder = new AuditBuilder(tx, { actor_id });
      builder.setTarget(TARGET_TYPE.COLLECTION, collection_id);

      await builder.createBatch(
        tx,
        AUTH_EVENT_TYPE.COLLECTION_DATASET_ADDED,
        createdRecords.map(({ dataset_id }) => ({
          resource_id: dataset_id,
          metadata: { dataset_id },
        })),
      );
    }

    return createdRecords;
  });
}

/**
 * Remove datasets from collection
 * @param {string} collection_id - UUID of the collection
 * @param {string[]} dataset_ids - UUIDs of datasets to remove from the collection
 * @param {string} actor_id - UUID of the user performing the action
 * @returns {Promise<Object[]>} Removed records
 */
async function removeDatasets(collection_id, { dataset_ids, actor_id }) {
  if (!dataset_ids.length) return [];
  return prisma.$transaction(async (tx) => {
    // Acquire a row-level lock on the collection row.
    // Any concurrent transaction trying to FOR UPDATE the same row will block.
    // So all addDatasets and removeDatasets calls for the same collection_id are serialized.
    const collectionRows = await tx.$queryRaw`
      SELECT is_archived FROM collection
      WHERE id = ${collection_id}
      FOR UPDATE;
    `;
    if (collectionRows.length === 0) {
      throw createError.NotFound('Collection not found');
    }
    const { is_archived } = collectionRows[0];
    if (is_archived) {
      throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);
    }

    const removedRecords = await tx.$queryRaw`
      DELETE FROM collection_dataset
      WHERE collection_id = ${collection_id}
      AND dataset_id = ANY(${dataset_ids}::text[])
      RETURNING collection_id, dataset_id;
     `;

    // Create audit records for each removed dataset
    if (removedRecords.length > 0) {
      const builder = new AuditBuilder(tx, { actor_id });
      builder.setTarget(TARGET_TYPE.COLLECTION, collection_id);

      await builder.createBatch(
        tx,
        AUTH_EVENT_TYPE.COLLECTION_DATASET_REMOVED,
        removedRecords.map(({ dataset_id }) => ({
          resource_id: dataset_id,
          metadata: { dataset_id },
        })),
      );
    }

    return removedRecords;
  });
}

/** * Get collection by ID
 * @param {string} collection_id - UUID of the collection
 * @returns {Promise<Object>}
 */
async function getCollectionById(collection_id) {
  return prisma.collection.findUniqueOrThrow({
    where: { id: collection_id },
    include: PRISMA_COLLECTION_INCLUDES,
  });
}

/** * Check if a user has a specific grant for a collection
 * @param {string} user_id - UUID of the user
 * @param {string} collection_id - UUID of the collection
 * @param {string} access_type - Access type to check (e.g. 'READ', 'WRITE')
 * @returns {Promise<boolean>} True if the user has the specified grant, false otherwise
 */
async function userHasGrant({ user_id, collection_id, access_type }) {
  return grantService.userHasGrant({
    user_id,
    resource_type: 'COLLECTION',
    resource_id: collection_id,
    access_types: [access_type],
  });
}

function buildAccessibleCollectionIdsCte(user_id, scope) {
  const includeAll = scope === RESOURCE_SCOPES.ALL;
  const parts = [];

  if (includeAll || scope === RESOURCE_SCOPES.GRANTS) {
    parts.push(Prisma.sql`(${grantService.accessibleCollectionsByGrantsQuery(user_id)})`);
  }

  if (includeAll || scope === RESOURCE_SCOPES.OWNED) {
    parts.push(Prisma.sql`
      SELECT c.id
      FROM "collection" c
      JOIN group_user gu ON c.owner_group_id = gu.group_id
      WHERE gu.user_id = ${user_id} AND gu.role = ${enumToSql(GROUP_MEMBER_ROLE.ADMIN)}
    `);
  }

  if (includeAll || scope === RESOURCE_SCOPES.OVERSIGHT) {
    parts.push(Prisma.sql`
      SELECT c.id
      FROM "collection" c
      JOIN effective_user_oversight_groups eug
        ON eug.user_id = ${user_id} AND c.owner_group_id = eug.group_id
    `);
  }

  if (parts.length === 0) {
    // No known scope provided; return no rows to avoid granting access.
    parts.push(Prisma.sql`SELECT NULL::text AS id WHERE FALSE`);
  }

  return Prisma.sql`
    WITH accessible_ids AS (
      ${Prisma.join(parts, '\n\nUNION\n\n')}
    )
  `;
}

/**
 * Search collections accessible to a user with optional filters and pagination
 * @param {string} user_id - UUID of the user performing the search
 * @param {string} [search_term] - Optional search term to filter collections by name, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) collections
 * @param {string|null} owner_group_id - Optional filter to include only collections owned by a specific group
 * @param {string|null} dataset_id - Optional filter to include only collections containing a specific dataset
 * @param {RESOURCE_SCOPES} scope - Scope of the search ('all', 'owned', 'grants', 'oversight') to determine which collections the user has access to
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching collections
 */
async function searchCollectionsForUser({
  user_id,
  sort_by,
  sort_order,
  limit,
  offset,
  search_term = null,
  is_archived = null,
  owner_group_id = null,
  dataset_id = null,
  scope = 'all',
}) {
  // user is admin of the group that owns the collection
  // OR user has oversight of the group that owns the collection
  // OR user has grant for the collection

  let searchClause = Prisma.empty;
  if (search_term) {
    const likePattern = createLikePattern(search_term);
    searchClause = Prisma.sql`
      (
        c.name ILIKE ${likePattern} OR
        c.description ILIKE ${likePattern} OR
        c.slug ILIKE ${likePattern}
      )
      `;
  }

  let archivedClause = Prisma.empty;
  if (is_archived != null) {
    archivedClause = Prisma.sql`c.is_archived = ${is_archived}`;
  }

  let ownerGroupClause = Prisma.empty;
  if (owner_group_id != null) {
    ownerGroupClause = Prisma.sql`c.owner_group_id = ${owner_group_id}`;
  }

  let datasetClause = Prisma.empty;
  if (dataset_id != null) {
    datasetClause = Prisma.sql`
      EXISTS (
        SELECT 1
        FROM collection_dataset cd
        WHERE cd.collection_id = c.id AND cd.dataset_id = ${dataset_id}
      )
    `;
  }

  const whereClause = buildWhereClause([searchClause, archivedClause, ownerGroupClause, datasetClause], 'AND');

  const cte_query = buildAccessibleCollectionIdsCte(user_id, scope);

  const data_query = Prisma.sql`
    ${cte_query}
    SELECT 
      c.*, 
      (SELECT COUNT(*) FROM collection_dataset cd WHERE cd.collection_id = c.id) AS "dataset_count",
      (
        SELECT json_build_object('id', g.id, 'name', g.name, 'metadata', g.metadata) 
        FROM "group" g 
        WHERE g.id = c.owner_group_id
      ) AS "owner_group"
    FROM collection c
    JOIN accessible_ids a ON a.id = c.id
    ${whereClause}
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} 
    OFFSET ${offset}
  `;

  const count_query = Prisma.sql`
    ${cte_query}
    SELECT COUNT(*) AS total_count
    FROM collection c
    JOIN accessible_ids a ON a.id = c.id
    ${whereClause}
  `;

  // console.log(count_query.sql, count_query.values);

  const [countResult, collections] = await Promise.all([
    prisma.$queryRaw(count_query),
    prisma.$queryRaw(data_query),
  ]);

  const total_count = Number(countResult[0]?.total_count || 0);
  return {
    metadata: { total: total_count, limit, offset },
    data: collections.map((collection) => ({
      ...(_.omit(['dataset_count'])(collection)),
      _count: {
        datasets: Number(collection.dataset_count),
      },
    })),
  };
}

/**
 * Search all collections with optional filters and pagination (admin only)
 * @param {string} [search_term] - Optional search term to filter collections by name, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) collections
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching collections
 */
async function searchAllCollections({
  search_term = null,
  is_archived = null,
  dataset_id = null,
  owner_group_id = null,
  sort_by,
  sort_order,
  limit,
  offset,
}) {
  const where = {};
  if (search_term) {
    where.OR = [
      { name: { contains: search_term, mode: 'insensitive' } },
      { description: { contains: search_term, mode: 'insensitive' } },
      { slug: { contains: search_term, mode: 'insensitive' } },
    ];
  }
  if (is_archived != null) {
    where.is_archived = is_archived;
  }
  if (dataset_id != null) {
    where.datasets = {
      some: {
        dataset_id,
      },
    };
  }
  if (owner_group_id != null) {
    where.owner_group_id = owner_group_id;
  }

  // Handle sorting by computed '_count.datasets' field (dataset count)
  const orderBy = sort_by === '_count.datasets'
    ? { _count: { datasets: sort_order } }
    : { [sort_by]: sort_order };

  const collections = await prisma.collection.findMany({
    where,
    include: PRISMA_COLLECTION_INCLUDES,
    take: limit,
    skip: offset,
    orderBy,
  });
  const total = await prisma.collection.count({ where });
  return {
    metadata: { total, limit, offset },
    data: collections,
  };
}

/**
 * Get all collections containing a dataset
 * @param {string} dataset_id - UUID of the dataset
 * @param {object} options - Search and pagination options for searchAllCollections function
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByDataset(dataset_id, options) {
  return searchAllCollections({
    dataset_id,
    ...options,
  });
}

/**
 * Get all collections owned by a group
 * @param {string} group_id - UUID of the owning group
 * @param {object} options - Search and pagination options for searchAllCollections function
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByOwnerGroup(group_id, options) {
  return searchAllCollections({
    owner_group_id: group_id,
    ...options,
  });
}

/**
 * List datasets in a collection with pagination and sorting
 * @param {string} collection_id - UUID of the collection
 * @param {string} sort_by - Field to sort by (e.g. 'added_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of datasets in the collection
 */
async function listDatasetsInCollection({
  collection_id, limit, offset, sort_by, sort_order,
}) {
  const datasets = await prisma.dataset.findMany({
    where: {
      collections: {
        some: {
          collection_id,
        },
      },
    },
    take: limit,
    skip: offset,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.collection_dataset.count({
    where: {
      collection_id,
    },
  });
  return { metadata: { total, limit, offset }, data: datasets };
}

module.exports = {
  createCollection,
  updateCollectionMetadata,
  archiveCollection,
  unarchiveCollection,
  deleteCollection,
  addDatasets,
  removeDatasets,
  findCollectionsByDataset,
  findCollectionsByOwnerGroup,
  getCollectionById,
  userHasGrant,
  searchCollectionsForUser,
  searchAllCollections,
  listDatasetsInCollection,
};
