const createError = require('http-errors');

/**
 * The fields a dataset's state rules read, fetched by whichever id the caller holds.
 *
 * A dataset is addressed two ways in this codebase: the services take the numeric `id`, and the
 * routes and the authorization layer take `resource_id`. Both arrive here.
 *
 * `forUpdate` takes the row lock first, so a service's check reads the state its write will see.
 * A read-only caller, such as a file listing, does not need the lock.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

/** @param {string|number} id */
const whereFor = (id) => (typeof id === 'number' ? { id } : { resource_id: id });

/**
 * @param {Object} client - a transaction client, or the Prisma client
 * @param {string|number} id - the numeric dataset id, or its resource id
 * @param {Object} [options]
 * @param {boolean} [options.forUpdate] - lock the dataset row before reading its owning group
 * @returns {Promise<{id: number, resource_id: string, is_deleted: boolean,
 *   owner_group: {is_archived: boolean}}>}
 * @throws {HttpError} 404 when no dataset has that id
 */
async function readDatasetStateFields(client, id, { forUpdate = false } = {}) {
  const dataset = await client.dataset.findFirst({
    where: whereFor(id),
    select: {
      id: true, resource_id: true, is_deleted: true, owner_group_id: true,
    },
  });
  if (!dataset) throw createError.NotFound('Dataset not found');

  if (forUpdate) {
    await client.$queryRaw`SELECT id FROM dataset WHERE id = ${dataset.id} FOR UPDATE`;
  }

  const owner_group = await client.group.findUniqueOrThrow({
    where: { id: dataset.owner_group_id },
    select: { is_archived: true },
  });
  return { ...dataset, owner_group };
}

module.exports = { readDatasetStateFields };
