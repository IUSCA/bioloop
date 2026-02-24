const { Prisma } = require('@prisma/client');
const _ = require('lodash/fp');
const createError = require('http-errors');

const prisma = require('@/db');
const { generate_slug } = require('@/utils/slug');
const ConflictError = require('@/services/errors/ConflictError');
const AUTH_EVENTS = require('@/authorization');
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
 * @param {number} actor_id - User creating the collection (must have appropriate permissions)
 * @returns {Promise<Object>} Created collection
 */
async function createCollection(data, { actor_id }) {
  return prisma.$transaction(async (tx) => {
    // create slug - URL-friendly identifier based on name, e.g. "My Group" -> "my-group"
    const slug = await generate_slug({
      name: data.name,
      is_slug_unique_fn: make_slug_unique_fn(tx),
    });

    // create collection without any datasets
    const _collection = await tx.collection.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        metadata: data.metadata,
      },
      include: PRISMA_COLLECTION_INCLUDES,
    });

    // create audit record for group creation
    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENTS.COLLECTION_CREATED,
        actor_id,
        target_type: 'collection',
        target_id: _collection.id,
        action: 'create',
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
 * @throws {ConflictError} If the expected_version does not match the current version in the database, indicating a concurrent modification
 */
async function updateCollectionMetadata(collection_id, { data, expected_version }) {
  return prisma.$transaction(async (tx) => {
    let slug;
    const currentCollection = await tx.collection.findUniqueOrThrow({
      where: { id: collection_id },
    });

    // if current collection is archived, prevent any updates
    if (currentCollection.is_archived) {
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
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
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError
        && (e.code === 'P2025' || e.code === 'P2015')) {
        throw new ConflictError(CONFLICT_ERROR_MESSAGE);
      }
      throw e;
    }

    return updatedCollection;
  });
}

/**
 * Archive a collection (soft delete)
 *
 * @param {string} collection_id - ID of the collection to archive
 * @param {number} actor_id - User performing the archival action (must have appropriate permissions)
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
        event_type: AUTH_EVENTS.COLLECTION_ARCHIVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        action: 'update',
      },
    });

    return archivedCollection;
  });
}

/**
 *  Unarchive a collection
 *
 * @param {string} collection_id - ID of the collection to unarchive
 * @param {number} actor_id - User performing the unarchival action (must have appropriate permissions)
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
        event_type: AUTH_EVENTS.COLLECTION_UNARCHIVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        action: 'update',
      },
    });

    return unarchivedCollection;
  });
}

/**
 * Permanently delete a collection
 *
 * @param {string} collection_id - ID of the collection to delete
 * @param {number} actor_id - User performing the deletion action (must have appropriate permissions)
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
        event_type: AUTH_EVENTS.COLLECTION_DELETED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        action: 'delete',
      },
    });

    return deletedCollection;
  });
}

/**
 * Add datasets to collection
 * @param {string} collection_id
 * @param {number[]} dataset_ids
 * @param {number} actor_id
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
    SELECT d.id
    FROM dataset d
    JOIN "group" g ON d.owner_group_id = g.id
    JOIN collection_owner co ON d.owner_group_id = co.owner_group_id
    WHERE d.id = ANY(${dataset_ids}::int[]) and d.is_deleted = false and g.is_archived = false
  `;
  const validDatasetIds = datasetRows.map((row) => row.id);
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
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
    }

    const createdRecords = await tx.$queryRaw`
      INSERT INTO collection_dataset (collection_id, dataset_id, added_by)
      SELECT ${collection_id}, dataset_id, ${actor_id}
      FROM UNNEST(${dataset_ids}::int[]) AS dataset_id
      ON CONFLICT DO NOTHING
      RETURNING collection_id, dataset_id;
     `;

    // create audit records for each added dataset
    await tx.authorization_audit.createMany({
      data: createdRecords.map(({ dataset_id }) => ({
        event_type: AUTH_EVENTS.COLLECTION_DATASET_ADDED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        action: 'update',
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
 * @param {string} collection_id
 * @param {number[]} dataset_ids
 * @param {number} actor_id
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
      throw new ConflictError(ARCHIVED_ERROR_MESSAGE);
    }

    const removedRecords = await tx.$queryRaw`
      DELETE FROM collection_dataset
      WHERE collection_id = ${collection_id}
      AND dataset_id = ANY(${dataset_ids}::int[])
      RETURNING collection_id, dataset_id;
     `;

    // create audit records for each removed dataset
    await tx.authorization_audit.createMany({
      data: removedRecords.map(({ dataset_id }) => ({
        event_type: AUTH_EVENTS.COLLECTION_DATASET_REMOVED,
        actor_id,
        target_type: 'collection',
        target_id: collection_id,
        action: 'update',
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
 * @param {number} dataset_id
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByDataset(dataset_id) {
  return prisma.collection.findMany({
    where: {
      datasets: {
        some: {
          dataset_id,
        },
      },
    },
    include: PRISMA_COLLECTION_INCLUDES,
  });
}

async function getCollectionById(collection_id) {
  return prisma.collection.findUniqueOrThrow({
    where: { id: collection_id },
    include: PRISMA_COLLECTION_INCLUDES,
  });
}

async function userHasGrant({ user_id, collection_id, access_type }) {
  return grantService.userHasGrant({
    user_id,
    resource_type: 'COLLECTION',
    resource_id: collection_id,
    access_type,
  });
}

async function searchCollectionsForUser({
  user_id,
  search_term = null,
  sort_by,
  sort_order,
  limit,
  offset,
  is_archived = null,
}) {
  // user is member of collection owner group
  // OR user has grant for the collection with view_metadata access type

  const access_types = ['view_metadata'];

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

  return Prisma.sql`
    WITH user_groups AS (
      SELECT group_id
      FROM group_user
      WHERE user_id = ${user_id}
    ),
    all_groups AS (
      SELECT DISTINCT gc.ancestor_id AS id
      FROM "group" g
      JOIN user_groups ug ON g.id = ug.group_id
      JOIN group_closure gc ON gc.descendant_id = g.id
    ),
    accessible_collections_via_group AS (
      SELECT c.id
      from "collection" c
      JOIN all_groups ag ON c.owner_group_id = ag.id
    ),
    accessible_collections_via_grant AS (
      SELECT DISTINCT c.id
      FROM "grant" G
      JOIN grant_access_type gat ON G.access_type_id = gat.id
      JOIN "collection" c ON G.resource_id = c.id AND G.resource_type = 'COLLECTION'
      WHERE G.valid_from <= NOW()
      AND (G.valid_until IS NULL OR G.valid_until > NOW())
      AND G.revoked_at IS NULL
      AND (
        (
          G.subject_type = 'USER' AND G.subject_id = ${user_id} 
        )
        OR (
          G.subject_type = 'GROUP' AND G.subject_id IN (SELECT id FROM all_groups) 
        )
      )
      AND gat.name IN (${Prisma.join(access_types)})
    ),
    accessible_collections AS (
      SELECT id FROM accessible_collections_via_group
      UNION
      SELECT id FROM accessible_collections_via_grant
    )
    SELECT *
    FROM "collection" c
    WHERE 
      c.id IN (SELECT id FROM accessible_collections)
      ${searchClause}
      ${archivedClause}
    ORDER BY ${Prisma.raw(sort_by)} ${Prisma.raw(sort_order)}
    LIMIT ${limit} OFFSET ${offset}
  `;
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
  getCollectionById,
  userHasGrant,
  searchCollectionsForUser,
};
