const { Prisma } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');
const { randomUUID } = require('crypto');

const prisma = require('@/db');
const { generate_slug } = require('@/utils/slug');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const grantService = require('@/services/grants');

const PRISMA_COLLECTION_INCLUDES = {};
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

    // create collection without any datasets
    const _collection = await tx.collection.create({
      data: {
        id,
        name: data.name,
        slug,
        description: data.description ?? Prisma.skip,
        metadata: data.metadata ?? Prisma.skip,
        owner_group_id: data.owner_group_id,
      },
      include: PRISMA_COLLECTION_INCLUDES,
    });

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.COLLECTION_CREATED,
        actor_id,
        target_type: 'collection',
        target_id: _collection.id,
      },
    });

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

    // create audit record for collection archival
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.COLLECTION_ARCHIVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
      },
    });

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

    // create audit record for collection unarchival
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.COLLECTION_UNARCHIVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
      },
    });

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

    // create audit record for collection deletion
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.COLLECTION_DELETED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
      },
    });

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
    SELECT d.subject_id
    FROM dataset d
    JOIN "group" g ON d.owner_group_id = g.id
    JOIN collection_owner co ON d.owner_group_id = co.owner_group_id
    WHERE d.subject_id = ANY(${dataset_ids}::text[]) and d.is_deleted = false and g.is_archived = false
  `;
  const validDatasetIds = datasetRows.map((row) => row.subject_id);
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

    // create audit records for each added dataset
    await tx.authorization_audit.createMany({
      data: createdRecords.map(({ dataset_id }) => ({
        event_type: AUTH_EVENT_TYPE.COLLECTION_DATASET_ADDED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        metadata: {
          dataset_id,
        },
      })),
    });

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

    // create audit records for each removed dataset
    await tx.authorization_audit.createMany({
      data: removedRecords.map(({ dataset_id }) => ({
        event_type: AUTH_EVENT_TYPE.COLLECTION_DATASET_REMOVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        metadata: {
          dataset_id,
        },
      })),
    });

    return removedRecords;
  });
}

/**
 * Get all collections containing a dataset
 * @param {string} dataset_id - UUID of the dataset
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByDataset({
  dataset_id, limit, offset, sort_by, sort_order,
}) {
  const where = {
    datasets: {
      some: {
        dataset_id,
      },
    },
  };
  const data = await prisma.collection.findMany({
    where,
    include: PRISMA_COLLECTION_INCLUDES,
    take: limit,
    skip: offset,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.collection.count({
    where,
  });
  return { metadata: { total, limit, offset }, data };
}

/**
 * Get all collections owned by a group
 * @param {string} group_id - UUID of the owning group
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByOwnerGroup({
  group_id, limit, offset, sort_by, sort_order,
}) {
  const data = await prisma.collection.findMany({
    where: {
      owner_group_id: group_id,
    },
    include: PRISMA_COLLECTION_INCLUDES,
    take: limit,
    skip: offset,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.collection.count({
    where: {
      owner_group_id: group_id,
    },
  });
  return { metadata: { total, limit, offset }, data };
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

/**
 * Search collections accessible to a user with optional filters and pagination
 * @param {string} user_id - UUID of the user performing the search
 * @param {string} [search_term] - Optional search term to filter collections by name, description, or slug
 * @param {string} sort_by - Field to sort by (e.g. 'name', 'created_at')
 * @param {string} sort_order - Sort order ('asc' or 'desc')
 * @param {number} limit - Number of results to return
 * @param {number} offset - Pagination offset
 * @param {boolean|null} is_archived - Optional filter to include only archived (true), only non-archived (false), or all (null) collections
 * @returns {Promise<Object>} An object containing metadata about the search results and an array of matching collections
 */
async function searchCollectionsForUser({
  user_id,
  search_term = null,
  sort_by,
  sort_order,
  limit,
  offset,
  is_archived = null,
}) {
  // user is admin of the group that owns the collection
  // OR user has oversight of the group that owns the collection
  // OR user has grant for the collection

  let searchClause = Prisma.empty;
  if (search_term) {
    searchClause = Prisma.sql`
      AND (
        c.name ILIKE ${`%${search_term}%`} OR
        c.description ILIKE ${`%${search_term}%`} OR
        c.slug ILIKE ${`%${search_term}%`}
      )
      `;
  }

  let archivedClause = Prisma.empty;
  if (is_archived !== null) {
    archivedClause = Prisma.sql`
        AND c.is_archived = ${is_archived}
      `;
  }

  const query = Prisma.sql`
    WITH results AS (
      WITH accessible_collections_via_grants AS (
        ${grantService.accessibleCollectionsByGrantsQuery(user_id)}
      ),
      owned_collections AS (
        SELECT id FROM "collection" c
        JOIN group_user gu ON c.owner_group_id = gu.group_id
        WHERE gu.user_id = ${user_id} AND gu.role = 'ADMIN'
      ),
      oversight_collections AS (
        SELECT id FROM "collection" c
        JOIN effective_user_oversight_groups eug 
          ON eug.user_id = ${user_id} AND c.owner_group_id = eug.group_id
      ),
      accessible_collections AS (
        SELECT id FROM owned_collections
        UNION
        SELECT id FROM oversight_collections
        UNION
        SELECT id FROM accessible_collections_via_grants
      )
      SELECT *
      FROM "collection" c
      JOIN accessible_collections ac ON c.id = ac.id
      WHERE 
        1=1
        ${searchClause}
        ${archivedClause}
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM results
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} 
    OFFSET ${offset}
  `;
  const collections = await prisma.$queryRaw(query);
  const total_count = Number(collections.length > 0 ? collections[0].total_count : 0);
  return { metadata: { total: total_count, limit, offset }, data: collections };
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
  if (is_archived !== null) {
    where.is_archived = is_archived;
  }
  const collections = await prisma.collection.findMany({
    where,
    include: PRISMA_COLLECTION_INCLUDES,
    take: limit,
    skip: offset,
    orderBy: {
      [sort_by]: sort_order,
    },
  });
  const total = await prisma.collection.count({ where });
  return { metadata: { total, limit, offset }, data: collections };
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
