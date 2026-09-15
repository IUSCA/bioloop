/**
 * What a user holds on one dataset or collection through grants, read from `accessPathsQuery`.
 *
 * Both functions ask the statement the engine and the lists ask, keeping only its `grant`
 * rows, so they cannot disagree with either.
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */

const { RESOURCE_TYPE } = require('@prisma/client');

const prisma = require('@/db');
const { accessPathsQuery } = require('@/authorization/builtin/accessPaths');
const accessTypeClosure = require('./accessTypeClosure');

const PATH_RESOURCE_TYPE = {
  [RESOURCE_TYPE.DATASET]: 'dataset',
  [RESOURCE_TYPE.COLLECTION]: 'collection',
};

async function grantRows(user_id, resource_id, resource_type, accessTypes = null) {
  const resourceType = PATH_RESOURCE_TYPE[resource_type];
  if (!resourceType) throw new Error(`Grants are not held on resource type ${resource_type}`);
  const rows = await prisma.$queryRaw(accessPathsQuery({
    userId: user_id, resourceType, resourceIds: [resource_id], accessTypes,
  }));
  return rows.filter((r) => r.path_kind === 'grant');
}

/**
 * Every access type a user holds on one resource, widened through the implication closure.
 * @param {string} user_id - a user's subject id, or PUBLIC_GROUP_ID for an anonymous caller
 * @param {string} resource_id - the dataset's or collection's resource id
 * @param {'DATASET'|'COLLECTION'} resource_type
 * @returns {Promise<Set<string>>}
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */
async function getGrantAccessTypesForUser(user_id, resource_id, resource_type) {
  const rows = await grantRows(user_id, resource_id, resource_type);
  return accessTypeClosure.expand(rows.map((r) => r.access_type));
}

/**
 * Whether a user holds a grant satisfying at least one of `access_types` on one resource.
 * @param {Object} args
 * @param {string} args.user_id
 * @param {'DATASET'|'COLLECTION'} args.resource_type
 * @param {string} args.resource_id
 * @param {string[]} args.access_types - at least one
 * @returns {Promise<boolean>}
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Refusal of an under-specified question
 */
async function userHasGrant({
  user_id, resource_type, resource_id, access_types,
}) {
  if (!Array.isArray(access_types) || access_types.length === 0) {
    throw new Error('userHasGrant requires at least one access type');
  }
  const satisfying = await accessTypeClosure.satisfiedBy(access_types);
  const rows = await grantRows(user_id, resource_id, resource_type, satisfying);
  return rows.length > 0;
}

module.exports = { getGrantAccessTypesForUser, userHasGrant };
