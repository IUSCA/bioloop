const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

/**
 * The restriction layer.
 *
 *   allowed = no restriction blocks this  AND  some grant permits it
 *
 * A restriction never cancels a grant and never references one, so adding one can only
 * narrow access, and AND commutes so the order two are applied in does not matter.
 *
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 */

const { RESTRICTION_CLASS } = require('../core/policies/PolicyContainer');

/**
 * The restriction classes each restriction type blocks, and the actions it exempts.
 *
 * An action's class is declared on its own row, with `mutating`, `reading`, or `readingData`,
 * so an action is classified where it is written and the registry completeness test refuses
 * one that is not. Nothing here lists actions by name except the exemptions.
 *
 * - **ARCHIVED** blocks every mutation. Archiving is a governance boundary closure: creating
 *   and revoking grants, changing membership, and changing collection contents all stop, and
 *   reading goes on.
 * - **DELETED** blocks every mutation and every read of the bytes. A soft-deleted dataset
 *   stays as metadata, and a grant cannot confer access to bytes that are gone.
 *
 * `unarchive` is exempt from both. It lifts the restriction archiving applied, and blocking it
 * would leave an archived resource impossible to restore. Moving a dataset out of the archived
 * `Unassigned Datasets` group is ownership transfer, which is deferred.
 *
 * @see docs/design/groups/access-model.md — The decision rule
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, rows 2 and 4
 */
const RESTRICTION_TYPES = Object.freeze({
  ARCHIVED: Object.freeze({ blocks: [RESTRICTION_CLASS.MUTATING], exempt: ['unarchive'] }),
  DELETED: Object.freeze({ blocks: [RESTRICTION_CLASS.MUTATING, RESTRICTION_CLASS.DATA], exempt: ['unarchive'] }),
});

/**
 * The registry the classes are read from. Required on first use, because the registry module
 * requires this one while it builds.
 */
function registry() {
  // eslint-disable-next-line global-require
  return require('..').policyRegistry;
}

/**
 * Whether a restriction of the given type blocks the given qualified action.
 * @param {string} typeName
 * @param {string} qualifiedAction - `${resourceType}.${action}`
 * @throws {Error} when no container registers the action
 */
function typeBlocks(typeName, qualifiedAction) {
  const type = RESTRICTION_TYPES[typeName];
  // An unknown type blocks nothing rather than everything: a restriction type seeded
  // without a matching entry here is a gap to report, not a reason to lock the platform.
  if (!type) return false;
  const [resourceType, action] = qualifiedAction.split('.');
  if (type.exempt.includes(action)) return false;
  return type.blocks.includes(registry().get(resourceType).getRestrictionClass(action));
}

/**
 * Every registered action a restriction type blocks, as `${resourceType}.${action}`.
 * @param {string} typeName
 * @returns {string[]}
 */
function blockedActions(typeName) {
  return registry().listTypes().flatMap((resourceType) => registry().get(resourceType).getActionNames()
    .map((action) => `${resourceType}.${action}`))
    .filter((qualified) => typeBlocks(typeName, qualified));
}

/**
 * Whether any restriction type defined today could block this qualified action. Reading a
 * record is never blocked, so most checks stop here without a query.
 */
function actionCouldBeBlocked(qualifiedAction) {
  return Object.keys(RESTRICTION_TYPES)
    .some((typeName) => typeBlocks(typeName, qualifiedAction));
}

/**
 * The restriction types in force on a group or a resource, following the group tree.
 *
 * @param {Object} target
 * @param {string} [target.group_id]
 * @param {string} [target.resource_id]
 * @returns {Promise<string[]>} restriction type names
 */
async function effectiveRestrictionTypes({ group_id = null, resource_id = null }) {
  if (!group_id && !resource_id) return [];

  const clause = group_id
    ? Prisma.sql`group_id = ${group_id}`
    : Prisma.sql`resource_id = ${resource_id}`;

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT type_name FROM effective_restriction WHERE ${clause}
  `);
  return rows.map((r) => r.type_name);
}

/**
 * The restriction types in force on each of several groups or resources, from one statement.
 *
 * A list offers capabilities on every row. Reading the types once per page, and testing each
 * action with `typeBlocks`, gives the answer `checkRestriction` gives one action at a time.
 *
 * @param {string} resourceType - `group`, `dataset`, or `collection`
 * @param {string[]} ids - group ids for a group, resource ids otherwise
 * @returns {Promise<Map<string, string[]>>} an entry for every id
 */
async function restrictionTypesByTarget(resourceType, ids) {
  const byId = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return byId;
  const column = resourceType === 'group' ? Prisma.raw('group_id') : Prisma.raw('resource_id');
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT ${column} AS id, type_name FROM effective_restriction WHERE ${column} IN (${Prisma.join(ids)})
  `);
  rows.forEach((r) => byId.get(r.id)?.push(r.type_name));
  return byId;
}

/**
 * Whether any restriction in force blocks this action on this target.
 *
 * Returns the blocking type name, or null when nothing blocks. Callers turn a non-null
 * result into a denial; the name is returned so the denial can say which restriction, which
 * is the whole point of preferring this over a scattered set of `is_archived` checks.
 *
 * @param {string} resourceType
 * @param {string} action
 * @param {Object} target - `{ group_id }` or `{ resource_id }`
 * @returns {Promise<string|null>}
 */
async function blockingRestriction(resourceType, action, target) {
  const qualifiedAction = `${resourceType}.${action}`;

  // Reading is never blocked by any type defined today, so skip the query entirely rather
  // than paying for it on the read path, which is almost every request.
  if (!actionCouldBeBlocked(qualifiedAction)) return null;

  const types = await effectiveRestrictionTypes(target);
  return types.find((typeName) => typeBlocks(typeName, qualifiedAction)) || null;
}

/**
 * Raised when a restrictable action reaches the restriction check with nothing to check.
 *
 * A missing target used to allow the action, so a route that forgot to say which resource a
 * grant or a request concerned was never checked against ARCHIVED. An unanswerable question is
 * now an error that names the action, the same way `userHasGrant` refuses an empty type list.
 * @see docs/design/groups/access-model-verification-plan.md — The restriction check refuses when it cannot find a target
 */
class RestrictionTargetError extends Error {
  constructor(resourceType, action) {
    super(`Cannot resolve a restriction target for ${resourceType}.${action}: `
      + 'the call supplied neither a resource id nor the resource it concerns');
    this.name = 'RestrictionTargetError';
  }
}

/**
 * What a restriction check should look at, for a given policy evaluation.
 *
 * - A group is addressed by its id. A root group being created has no parent, so nothing
 *   restricts it.
 * - A dataset or a collection is addressed by resource id. A create action has no resource
 *   yet, so it is addressed by the owning group it names, and an archived owner or an
 *   archived ancestor of that owner blocks it.
 * - A grant or an access request is not itself restrictable. The check follows through to the
 *   resource it concerns: from the pre-fetched resource when the route supplies one, and
 *   otherwise by reading the row the id names.
 *
 * Returns null when there is nothing that could be restricted. Throws when the action could
 * be restricted and the call carries nothing to resolve.
 *
 * @param {string} resourceType
 * @param {string} action
 * @param {string|null} resourceId
 * @param {Object|null} preFetchedResource
 * @returns {Promise<{group_id?: string, resource_id?: string}|null>}
 */
async function restrictionTargetFor(resourceType, action, resourceId, preFetchedResource) {
  if (resourceType === 'group') {
    return resourceId ? { group_id: resourceId } : null;
  }
  if (resourceType === 'dataset' || resourceType === 'collection') {
    if (resourceId) return { resource_id: resourceId };
    const ownerGroupId = preFetchedResource?.owner_group_id;
    if (ownerGroupId) return { group_id: ownerGroupId };
    throw new RestrictionTargetError(resourceType, action);
  }
  if (resourceType === 'grant' || resourceType === 'access_request') {
    const underlying = preFetchedResource?.resource_id;
    if (underlying) return { resource_id: underlying };
    if (resourceId) {
      const model = resourceType === 'grant' ? prisma.grant : prisma.access_request;
      const row = await model.findUnique({ where: { id: resourceId }, select: { resource_id: true } });
      // An id that names no row concerns nothing that could be restricted. The policy and the
      // service answer for the missing row.
      return row ? { resource_id: row.resource_id } : null;
    }
    throw new RestrictionTargetError(resourceType, action);
  }
  return null;
}

/**
 * The restriction checker handed to the authorization middleware.
 *
 * Returns a type name when something blocks, null otherwise. Kept in this shape so the
 * core engine takes it as a dependency and stays free of any knowledge of restrictions.
 */
async function checkRestriction({
  resourceType, action, resourceId, preFetchedResource,
}) {
  if (!actionCouldBeBlocked(`${resourceType}.${action}`)) return null;
  const target = await restrictionTargetFor(resourceType, action, resourceId, preFetchedResource);
  if (!target) return null;
  return blockingRestriction(resourceType, action, target);
}

module.exports = {
  RESTRICTION_TYPES,
  typeBlocks,
  blockedActions,
  effectiveRestrictionTypes,
  restrictionTypesByTarget,
  blockingRestriction,
  restrictionTargetFor,
  checkRestriction,
  RestrictionTargetError,
};
