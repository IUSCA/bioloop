const { RESOURCE_TYPE } = require('@prisma/client');

/**
 * The state of the dataset or collection a grant or an access request concerns.
 *
 * A grant and a request have no archived or deleted state of their own. They carry a status, and
 * they name a resource whose state also decides what they admit. Their rules therefore read a
 * `target`, and this reads one, so the query is written here rather than in each caller.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

const TARGET_SELECT = {
  type: true,
  dataset: { select: { is_deleted: true, owner_group: { select: { is_archived: true } } } },
  collection: { select: { is_archived: true, owner_group: { select: { is_archived: true } } } },
};

/** Shapes one resource row into the `target` the grant and request rules read. */
function targetOf(resource) {
  if (resource.dataset) {
    return {
      kind: 'dataset',
      deleted: resource.dataset.is_deleted,
      archived: resource.dataset.owner_group.is_archived,
    };
  }
  if (resource.collection) {
    return {
      kind: 'collection',
      deleted: false,
      archived: resource.collection.is_archived || resource.collection.owner_group.is_archived,
    };
  }
  // A resource row of a type that carries no state of its own, such as a group resource.
  return { kind: String(resource.type ?? RESOURCE_TYPE.DATASET).toLowerCase(), deleted: false, archived: false };
}

/**
 * @param {Object} client - a transaction client, or the Prisma client
 * @param {string} resourceId
 * @returns {Promise<{kind: string, archived: boolean, deleted: boolean}|null>} null when no
 *   resource has that id
 */
async function readTargetState(client, resourceId) {
  const resource = await client.resource.findUnique({
    where: { id: resourceId },
    select: TARGET_SELECT,
  });
  return resource ? targetOf(resource) : null;
}

/**
 * The same, for a page of resource ids.
 * @returns {Promise<Map<string, {kind: string, archived: boolean, deleted: boolean}>>}
 */
async function readTargetStates(client, resourceIds) {
  const ids = [...new Set(resourceIds)];
  if (!ids.length) return new Map();
  const resources = await client.resource.findMany({
    where: { id: { in: ids } },
    select: { id: true, ...TARGET_SELECT },
  });
  return new Map(resources.map((resource) => [resource.id, targetOf(resource)]));
}

/**
 * The fields a collection's state rules read, including the history that decides `delete`.
 *
 * `has_history` is two counts rather than a column, so a caller that wants the collection's
 * available actions cannot read them off the collection row.
 *
 * @param {Object} client - a transaction client, or the Prisma client
 * @param {string} collectionId
 * @returns {Promise<Object>} the row the rules read
 */
async function readCollectionStateFields(client, collectionId) {
  const collection = await client.collection.findUniqueOrThrow({
    where: { id: collectionId },
    select: { id: true, is_archived: true, owner_group: { select: { is_archived: true } } },
  });
  const [datasetRows, requestRows] = await Promise.all([
    client.collection_dataset.count({ where: { collection_id: collectionId } }),
    client.access_request.count({ where: { resource_id: collectionId } }),
  ]);
  return { ...collection, has_history: datasetRows > 0 || requestRows > 0 };
}

/**
 * The fields an access request's state rules read, from a request already fetched with its
 * `resource` and that resource's dataset or collection.
 *
 * No query: the detail and list routes include the resource already, and a request's rules read
 * its status and the state of what it names.
 *
 * @param {Object} request - as `INCLUDES_CONFIG` returns it
 * @returns {Object} the row the rules read
 */
function requestStateFields(request) {
  return {
    status: request.status,
    target: request.resource ? targetOf(request.resource) : { kind: 'resource', archived: false, deleted: false },
  };
}

module.exports = {
  TARGET_SELECT,
  targetOf,
  readTargetState,
  readTargetStates,
  readCollectionStateFields,
  requestStateFields,
};
