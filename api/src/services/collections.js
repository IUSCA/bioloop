const { Prisma, RESOURCE_TYPE } = require('@prisma/client');
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
const state = require('@/state');
const { buildWhereClause, createLikePattern } = require('@/utils/sql');
const { accessibleIdsQuery } = require('@/authorization/builtin/accessPaths');
const { RESOURCE_SCOPES } = require('./resources');

/**
 * Locks a collection row and returns the fields its state rules read, its owning group included.
 *
 * A collection is archived by its own column or by its owning group's, one step up, so both are
 * read. The lock comes first, so the state the write sees is the state the check read.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} collection_id
 * @returns {Promise<{id: string, is_archived: boolean, owner_group: {is_archived: boolean}}>}
 * @throws {HttpError} 404 when no collection has that id
 */
async function lockCollectionForState(tx, collection_id) {
  const rows = await tx.$queryRaw`
    SELECT id, is_archived, owner_group_id FROM collection WHERE id = ${collection_id} FOR UPDATE
  `;
  if (rows.length === 0) throw createError.NotFound('Collection not found');
  const owner_group = await tx.group.findUniqueOrThrow({
    where: { id: rows[0].owner_group_id },
    select: { is_archived: true },
  });
  return { ...rows[0], owner_group };
}

const PRISMA_COLLECTION_INCLUDES = {
  _count: {
    select: { datasets: true },
  },
  owner_group: true,
};
const CONFLICT_ERROR_MESSAGE = 'Collection was updated by another process. Please refresh and try again.';

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

    // An archived group takes no new collection. Only the owning group's own column is read.
    const owner_group = await tx.group.findUniqueOrThrow({
      where: { id: data.owner_group_id },
      select: { is_archived: true },
    });
    state.assertPossible('collection', 'create', { owner_group });

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
      // `datasets` reads the active_collection_dataset view; rows are written to the history table.
      createData.dataset_history = {
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

    // The owning group reads what it governs. Written here rather than derived from
    // membership, so what members hold is a visible, revocable row.
    // @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
    await grantService.seedOwningGroupGrant(tx, {
      resource_id: _collection.id,
      resource_type: RESOURCE_TYPE.COLLECTION,
      owner_group_id: _collection.owner_group_id,
      actor_id,
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
    state.assertPossible('collection', 'edit_metadata', await lockCollectionForState(tx, collection_id));

    const currentCollection = await tx.collection.findUniqueOrThrow({
      where: { id: collection_id },
    });

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
    state.assertPossible('collection', 'archive', await lockCollectionForState(tx, collection_id));

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
    state.assertPossible('collection', 'unarchive', await lockCollectionForState(tx, collection_id));

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
    // Locked first, so a dataset added concurrently either lands before the history check or
    // waits for the delete. `addDatasets` takes the same lock.
    const locked = await lockCollectionForState(tx, collection_id);

    // A collection that has ever held a dataset, or that anybody has asked access to, carries
    // history that decision 1 preserves. It is archived instead.
    // @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
    const [datasetRows, requestRows] = await Promise.all([
      tx.collection_dataset.count({ where: { collection_id } }),
      tx.access_request.count({ where: { resource_id: collection_id } }),
    ]);
    state.assertPossible('collection', 'delete', {
      ...locked,
      has_history: datasetRows > 0 || requestRows > 0,
    });

    // grant.resource is onDelete: Restrict, so a collection carrying any grant cannot be
    // deleted while those rows stand. Every collection now carries at least the owning
    // group's seeded grant, so this is not an edge case.
    //
    // The rows go rather than being revoked. A revoked grant on a collection that no longer
    // exists is not a fact anybody can use, and who held access survives in
    // authorization_audit, which records ids rather than holding foreign keys.
    // @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
    await tx.grant.deleteMany({ where: { resource_id: collection_id } });

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

  return prisma.$transaction(async (tx) => {
    // Acquire a row-level lock on the collection row.
    // Any concurrent transaction trying to FOR UPDATE the same row will block.
    // So all addDatasets and removeDatasets calls for the same collection_id are serialized.
    //
    // The state check comes before the validation below, and the two answer different
    // questions. An archived collection, or one whose owning group is archived, is a state
    // that admits no change and answers 409. An unknown, deleted, or foreign dataset is a bad
    // request from the caller and answers 400.
    // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
    state.assertPossible('collection', 'add_dataset', await lockCollectionForState(tx, collection_id));

    // Every dataset must exist, not be deleted, and be owned by the collection's owning group.
    // The join ties the dataset's owning group to the collection's, so that group's archived
    // state is exactly what the check above already read.
    const datasetRows = await tx.$queryRaw`
      WITH collection_owner AS (
        SELECT owner_group_id FROM collection WHERE id = ${collection_id}
      )
      SELECT d.resource_id
      FROM dataset d
      JOIN collection_owner co ON d.owner_group_id = co.owner_group_id
      WHERE d.resource_id = ANY(${dataset_ids}::text[]) and d.is_deleted = false
    `;
    const validDatasetIds = datasetRows.map((row) => row.resource_id);
    const invalidDatasetIds = dataset_ids.filter((id) => !validDatasetIds.includes(id));
    if (invalidDatasetIds.length) {
      throw createError.BadRequest(
        `The following dataset IDs are invalid for adding to the collection: ${invalidDatasetIds.join(', ')}`
        + ' Datasets must exist, not be deleted, and have the same owner group as the collection.',
      );
    }

    const createdRecords = await tx.$queryRaw`
      INSERT INTO collection_dataset (collection_id, dataset_id, added_by)
      SELECT ${collection_id}, dataset_id, ${actor_id}
      FROM UNNEST(${dataset_ids}::text[]) AS dataset_id
      ON CONFLICT (collection_id, dataset_id) WHERE removed_at IS NULL DO NOTHING
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
    state.assertPossible('collection', 'remove_dataset', await lockCollectionForState(tx, collection_id));

    // Close the row rather than deleting it. A collection grant conferred access to whatever
    // the collection held at the time, so deleting the row would destroy one of the three
    // inputs to "who could read this dataset on date X?".
    // @see docs/design/groups/decisions.md — 1. Membership and collection history are preserved
    const removedRecords = await tx.$queryRaw`
      UPDATE collection_dataset
      SET removed_at = CURRENT_TIMESTAMP, removed_by = ${actor_id}
      WHERE collection_id = ${collection_id}
      AND dataset_id = ANY(${dataset_ids}::text[])
      AND removed_at IS NULL
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

/** The path kinds each list scope reads. @see docs/design/groups/access-model.md — Paths and standing */
const COLLECTION_SCOPE_PATH_KINDS = {
  [RESOURCE_SCOPES.ALL]: ['admin', 'oversight', 'grant'],
  [RESOURCE_SCOPES.OWNED]: ['admin'],
  [RESOURCE_SCOPES.GRANTS]: ['grant'],
  [RESOURCE_SCOPES.OVERSIGHT]: ['oversight'],
};

/**
 * The collections a user reaches under one list scope, as the `accessible_ids` CTE.
 * @see src/authorization/builtin/accessPaths.js
 * @param {string} user_id - subject id
 * @param {string} scope - one of RESOURCE_SCOPES
 * @param {string[]} grant_access_types - `satisfiedBy(['COLLECTION:VIEW_METADATA'])`, the
 *   types that let a caller open a collection, so every listed collection opens
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */
function buildAccessibleCollectionIdsCte(user_id, scope, grant_access_types) {
  const pathKinds = COLLECTION_SCOPE_PATH_KINDS[scope];
  if (!pathKinds) throw new Error(`No collection list scope named ${scope}`);
  return Prisma.sql`
    WITH accessible_ids AS (
      SELECT ids.resource_id AS id
      FROM (${accessibleIdsQuery({
    userId: user_id, resourceType: 'collection', accessTypes: grant_access_types, pathKinds,
  })}) ids
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
        FROM active_collection_dataset cd
        WHERE cd.collection_id = c.id AND cd.dataset_id = ${dataset_id}
      )
    `;
  }

  const whereClause = buildWhereClause([searchClause, archivedClause, ownerGroupClause, datasetClause], 'AND');

  const grant_access_types = await grantService.satisfiedBy(['COLLECTION:VIEW_METADATA']);
  const cte_query = buildAccessibleCollectionIdsCte(user_id, scope, grant_access_types);

  const data_query = Prisma.sql`
    ${cte_query}
    SELECT 
      c.*, 
      (SELECT COUNT(*) FROM active_collection_dataset cd WHERE cd.collection_id = c.id) AS "dataset_count",
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

  const total = await prisma.collection.count({ where });

  // `collection.datasets` reads the active_collection_dataset view, and Prisma cannot order by
  // a count through a view relation. The count ranks the matching ids here, then pages them.
  let collections;
  if (sort_by === '_count.datasets') {
    const counted = await prisma.collection.findMany({
      where, select: { id: true, _count: { select: { datasets: true } } },
    });
    const direction = sort_order === 'desc' ? -1 : 1;
    const pageIds = counted
      .sort((x, y) => direction * (x._count.datasets - y._count.datasets) || x.id.localeCompare(y.id))
      .slice(offset, offset + limit)
      .map((c) => c.id);
    const rows = await prisma.collection.findMany({
      where: { id: { in: pageIds } }, include: PRISMA_COLLECTION_INCLUDES,
    });
    const byId = new Map(rows.map((c) => [c.id, c]));
    collections = pageIds.map((id) => byId.get(id));
  } else {
    collections = await prisma.collection.findMany({
      where,
      include: PRISMA_COLLECTION_INCLUDES,
      take: limit,
      skip: offset,
      orderBy: { [sort_by]: sort_order },
    });
  }
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
/**
 * The datasets currently in a collection, excluding deleted ones.
 * @param {Object} params
 * @param {string} params.collection_id
 * @param {string} [params.name] - case-insensitive substring of the dataset name
 * @param {number} params.limit
 * @param {number} params.offset
 * @param {string} params.sort_by
 * @param {'asc'|'desc'} params.sort_order
 * @returns {Promise<{metadata: {total: number, limit: number, offset: number}, data: Object[]}>}
 */
async function listDatasetsInCollection({
  collection_id, name, limit, offset, sort_by, sort_order,
}) {
  const where = {
    is_deleted: false,
    collections: { some: { collection_id } },
    ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
  };
  const [datasets, total] = await Promise.all([
    prisma.dataset.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [sort_by]: sort_order },
    }),
    prisma.dataset.count({ where }),
  ]);
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
  searchCollectionsForUser,
  searchAllCollections,
  listDatasetsInCollection,
};
