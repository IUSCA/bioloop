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

/**
 * Every policy action that changes state, as `${resourceType}.${action}`.
 *
 * ARCHIVED blocks exactly these and leaves reading alone. The list is written out rather
 * than inferred from a naming convention, because a convention silently fails to cover an
 * action somebody adds later; a test asserts every registered action appears in this set or
 * in READING_ACTIONS, so a new action cannot be forgotten.
 */
const MUTATING_ACTIONS = new Set([
  // group
  'group.create',
  'group.create_child',
  'group.archive',
  'group.edit_metadata',
  'group.add_member',
  'group.remove_member',
  'group.edit_member_role',
  'group.add_dataset',
  'group.add_collection',
  'group.unarchive',
  // Issuing or withdrawing an invitation. An archived group takes no new members by either
  // route, the same reasoning that puts dataset.contribute here.
  'group.invite',

  // collection
  'collection.create',
  'collection.edit_metadata',
  'collection.add_dataset',
  'collection.remove_dataset',
  'collection.transfer_ownership',
  'collection.delete',
  'collection.archive',
  'collection.manage_grants',
  'collection.review_access_requests',
  'collection.unarchive',

  // dataset
  'dataset.create',
  // Ingestion into a group. Mutating, so an archived group accepts no new datasets by
  // either route: a group under restriction should not keep growing.
  'dataset.contribute',
  'dataset.edit_metadata',
  'dataset.edit',
  'dataset.archive',
  'dataset.transfer_ownership',
  'dataset.request_stage',
  'dataset.manage_grants',
  'dataset.review_access_requests',
  'dataset.unarchive',

  // grant
  'grant.create',
  'grant.revoke',

  // access_request
  'access_request.create',
  'access_request.update',
  'access_request.review',
]);

/**
 * Every policy action that only reads. Kept beside the mutating set so a test can assert
 * the two together cover every registered action, and neither contains an action twice.
 */
const READING_ACTIONS = new Set([
  // group
  'group.view_metadata',
  'group.list',
  // Seeing which invitations are outstanding. Reading, and deliberately still available on
  // an archived group: the admin who has to explain why nobody can join needs the list.
  'group.view_invitations',
  'group.view_hierarchy',
  'group.list_invalid',
  'group.view_audit_logs',
  'group.view_members',
  'group.view_ancestors',
  'group.view_descendants',

  // collection
  'collection.view_metadata',
  'collection.list',
  'collection.list_datasets',
  'collection.list_grants',
  'collection.view_audit_logs',

  // dataset
  'dataset.view_metadata',
  'dataset.view_sensitive_metadata',
  'dataset.list',
  'dataset.list_files',
  'dataset.read_data',
  'dataset.download',
  'dataset.compute',
  'dataset.view_audit_logs',
  'dataset.view_workflows',
  'dataset.view_collections',
  'dataset.view_source_datasets',
  'dataset.view_derived_datasets',

  // grant
  'grant.read',
  'grant.list_for_resource',
  'grant.list_for_subject',
  'grant.view_coverage',
  'grant.list',

  // access_request
  'access_request.read',

  // user
  'user.list',
]);

/**
 * The only mutations ARCHIVED allows.
 *
 * `unarchive` is the act of lifting the restriction itself. Blocking it would make an
 * archived group or collection impossible to restore, which is the one shape of exemption
 * a restriction type always needs.
 *
 * Nothing else is exempt. Archiving is a governance boundary closure, and the archive
 * dialog already promises users that creating and revoking grants, changing membership,
 * and modifying collection contents all stop. Ownership transfer was exempted for a while,
 * so that datasets could be moved out of the archived `Unassigned Datasets` group without
 * unarchiving it; that made the rule harder to state for the sake of one workflow, and a
 * platform admin can unarchive, reassign, and re-archive instead, which leaves an audit
 * record of each step.
 * @see docs/design/groups/decisions.md — 2. Every dataset has an owning group
 *
 * These are exemptions of the ARCHIVED type, not a claim that they read rather than write.
 * A future restriction type decides its own.
 */
const ARCHIVED_EXEMPT_ACTIONS = new Set([
  'group.unarchive',
  'collection.unarchive',
  'dataset.unarchive',
]);

/**
 * Which actions each restriction type blocks.
 *
 * One type today. When a second arrives — an unsigned data use agreement blocks *reading*
 * by one person, rather than writing by everybody — this is the seam to re-examine, because
 * that type is per-subject and this map is not.
 */
const BLOCKED_ACTIONS_BY_TYPE = {
  ARCHIVED: new Set(
    [...MUTATING_ACTIONS].filter((action) => !ARCHIVED_EXEMPT_ACTIONS.has(action)),
  ),
};

/**
 * Whether a restriction of the given type blocks the given qualified action.
 * @param {string} typeName
 * @param {string} qualifiedAction - `${resourceType}.${action}`
 */
function typeBlocks(typeName, qualifiedAction) {
  const blocked = BLOCKED_ACTIONS_BY_TYPE[typeName];
  // An unknown type blocks nothing rather than everything: a restriction type seeded
  // without a matching entry here is a gap to report, not a reason to lock the platform.
  return blocked ? blocked.has(qualifiedAction) : false;
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
  const anyTypeCouldBlock = Object.keys(BLOCKED_ACTIONS_BY_TYPE)
    .some((typeName) => typeBlocks(typeName, qualifiedAction));
  if (!anyTypeCouldBlock) return null;

  const types = await effectiveRestrictionTypes(target);
  return types.find((typeName) => typeBlocks(typeName, qualifiedAction)) || null;
}

/**
 * What a restriction check should look at, for a given policy evaluation.
 *
 * Groups are addressed by group id. Datasets and collections are addressed by resource id,
 * which for a collection is the same value as its own id. A grant or an access request is
 * not itself restrictable, so the check follows through to the resource it concerns, which
 * the route supplies as pre-fetched data.
 *
 * Returns null when there is nothing to check, which is the case for a create action with
 * no resource yet and for the resource types restrictions do not attach to.
 *
 * @param {string} resourceType
 * @param {string|null} resourceId
 * @param {Object|null} preFetchedResource
 * @returns {{group_id?: string, resource_id?: string}|null}
 */
function restrictionTargetFor(resourceType, resourceId, preFetchedResource) {
  if (resourceType === 'group') {
    return resourceId ? { group_id: resourceId } : null;
  }
  if (resourceType === 'dataset' || resourceType === 'collection') {
    return resourceId ? { resource_id: resourceId } : null;
  }
  if (resourceType === 'grant' || resourceType === 'access_request') {
    const underlying = preFetchedResource?.resource_id;
    return underlying ? { resource_id: underlying } : null;
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
  const target = restrictionTargetFor(resourceType, resourceId, preFetchedResource);
  if (!target) return null;
  return blockingRestriction(resourceType, action, target);
}

module.exports = {
  MUTATING_ACTIONS,
  READING_ACTIONS,
  BLOCKED_ACTIONS_BY_TYPE,
  typeBlocks,
  effectiveRestrictionTypes,
  blockingRestriction,
  restrictionTargetFor,
  checkRestriction,
  ARCHIVED_EXEMPT_ACTIONS,
};
