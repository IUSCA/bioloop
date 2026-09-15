/**
 * The reference model: the access rule of docs/design/groups/access-model.md, in plain
 * JavaScript over in-memory arrays.
 *
 * It is an oracle, not an implementation. It never imports the engine, the services, or
 * Prisma, and it receives the tables as plain rows. Efficiency does not matter here; being
 * obviously the rule on the page does.
 *
 * Independence has a limit worth stating. The model page was written by reading the code, so
 * a mistake that reading made is shared by both. Disagreements the harness finds are either a
 * code bug or a gap in the page, and both are worth knowing.
 *
 * @see docs/design/groups/access-model.md — The decision rule
 * @see docs/design/groups/access-model-verification-plan.md — Reference model
 */

const ARCHIVED = 'ARCHIVED';

/** Actions that read the bytes of a dataset. Refused on a deleted dataset. @see decision 16, row 4 */
const DATA_PLANE_ACTIONS = new Set([
  'list_files', 'read_data', 'download', 'compute', 'remote_access', 'request_stage',
]);

/** Restriction exemptions: lifting a restriction is never blocked by it. */
const RESTRICTION_EXEMPT_ACTIONS = new Set(['unarchive']);

/** The resource types this model decides. `modelCoverage.test.js` fails on a registered type in neither this list nor its own. */
const MODELLED_RESOURCE_TYPES = ['group', 'dataset', 'collection'];

/**
 * @typedef {Object} World
 * @property {Date} now
 * @property {Array<{id, anonymous?: boolean, platform_admin?: boolean}>} users
 * @property {Array<{id, parent?: string|null, system_principal?: 'PUBLIC'|'AUTHENTICATED'|null,
 *   allow_user_contributions?: boolean, profile_visibility?: string}>} groups
 * @property {Array<{user, group, role: 'MEMBER'|'ADMIN', removed?: boolean, valid_until?: Date|null}>} memberships
 * @property {Array<{id, owner, deleted?: boolean}>} datasets
 * @property {Array<{id, owner, profile_visibility?: string}>} collections
 * @property {Array<{collection, dataset, removed?: boolean}>} contains
 * @property {Array<{id, subject_type: 'USER'|'GROUP', subject, resource, access_type,
 *   valid_from?: Date|null, valid_until?: Date|null, revoked?: boolean}>} grants
 * @property {Array<{group?: string, resource?: string, type: string, lifted?: boolean}>} restrictions
 */

/**
 * @param {Object} tables - from `modelTablesFrom`
 * @param {World} world
 */
function createReference(tables, world) {
  const now = world.now || new Date();
  const groups = new Map(world.groups.map((g) => [g.id, g]));
  const users = new Map(world.users.map((u) => [u.id, u]));
  const datasets = new Map(world.datasets.map((d) => [d.id, d]));
  const collections = new Map((world.collections || []).map((c) => [c.id, c]));
  const publicGroup = world.groups.find((g) => g.system_principal === 'PUBLIC');
  const authenticatedGroup = world.groups.find((g) => g.system_principal === 'AUTHENTICATED');

  // ---- time ---------------------------------------------------------------------------------

  /** `active(x, now)`: not removed, revoked, or lifted, started, and not ended. */
  const active = (row) => !row.removed && !row.revoked && !row.lifted
    && (row.valid_from == null || row.valid_from <= now)
    && (row.valid_until == null || row.valid_until > now);

  // ---- the group tree -----------------------------------------------------------------------

  const strictAncestors = (groupId) => {
    const out = [];
    let g = groups.get(groupId);
    while (g && g.parent) {
      out.push(g.parent);
      g = groups.get(g.parent);
    }
    return out;
  };
  const selfAndAncestors = (groupId) => [groupId, ...strictAncestors(groupId)];
  const strictDescendants = (groupId) => world.groups
    .filter((g) => g.id !== groupId && strictAncestors(g.id).includes(groupId))
    .map((g) => g.id);

  // ---- derived relations --------------------------------------------------------------------

  const activeMemberships = (userId) => world.memberships
    .filter((m) => m.user === userId && active(m));

  /** `effective_member(u, g)` for every g. Membership flows upward. */
  const effectiveGroups = (userId) => new Set(
    activeMemberships(userId).flatMap((m) => selfAndAncestors(m.group)),
  );

  /** `admin(u, g)` for every g. Authority does not flow. */
  const adminGroups = (userId) => new Set(
    activeMemberships(userId).filter((m) => m.role === 'ADMIN').map((m) => m.group),
  );

  /** `oversees(u, g)`: admin of a strict ancestor. */
  const overseenGroups = (userId) => new Set(
    [...adminGroups(userId)].flatMap((g) => strictDescendants(g)),
  );

  /** `subjects(u)`. */
  const subjects = (user) => {
    const out = new Set();
    if (publicGroup) out.add(publicGroup.id);
    if (user.anonymous) return out;
    out.add(user.id);
    effectiveGroups(user.id).forEach((g) => out.add(g));
    if (authenticatedGroup) out.add(authenticatedGroup.id);
    return out;
  };

  /** The reflexive, transitive closure of `implies` from one type. */
  const impliedBy = (type) => {
    const out = new Set([type]);
    const pending = [type];
    while (pending.length) {
      const from = pending.pop();
      tables.implications
        .filter(([f, to]) => f === from && !out.has(to))
        .forEach(([, to]) => { out.add(to); pending.push(to); });
    }
    return out;
  };

  const activeGrantsFor = (user) => {
    const subjectIds = subjects(user);
    return world.grants.filter((g) => active(g) && subjectIds.has(g.subject));
  };

  /** Every type `holds(u, r, t)` is true for. */
  const heldTypes = (user, resourceType, resourceId) => {
    const held = new Set();
    activeGrantsFor(user).forEach((grant) => {
      let reaches = grant.resource === resourceId;
      if (!reaches && resourceType === 'dataset') {
        // A collection grant reaches a dataset the collection actively contains, and only
        // through dataset access types. A collection type never counts for a dataset.
        reaches = grant.access_type.startsWith('DATASET:')
          && (world.contains || []).some((row) => row.collection === grant.resource
            && row.dataset === resourceId && active(row));
      }
      if (reaches) impliedBy(grant.access_type).forEach((t) => held.add(t));
    });
    return held;
  };

  /**
   * A grant, on a resource the group owns, held by the caller. A grant held only through a
   * system principal does not count. @see decision 16, row 8
   */
  const holdsGrantOnResourceOwnedBy = (user, groupId) => {
    const systemIds = new Set([publicGroup?.id, authenticatedGroup?.id].filter(Boolean));
    return activeGrantsFor(user).some((grant) => {
      if (systemIds.has(grant.subject)) return false;
      const owner = datasets.get(grant.resource)?.owner ?? collections.get(grant.resource)?.owner;
      return owner === groupId;
    });
  };

  const ownerOf = (resourceType, resourceId) => {
    if (resourceType === 'group') return resourceId;
    if (resourceType === 'dataset') return datasets.get(resourceId)?.owner;
    if (resourceType === 'collection') return collections.get(resourceId)?.owner;
    return null;
  };

  const resourceRow = (resourceType, resourceId) => {
    if (resourceType === 'group') return groups.get(resourceId);
    if (resourceType === 'dataset') return datasets.get(resourceId);
    if (resourceType === 'collection') return collections.get(resourceId);
    return null;
  };

  /** `restricted(r, a)`. A create names its owning group as `resourceId`'s owner. */
  const restricted = (resourceType, action, resourceId, ownerGroupId = null) => {
    const row = tables.actions[resourceType]?.[action];
    if (!row || row.restriction !== 'mutating' || RESTRICTION_EXEMPT_ACTIONS.has(action)) return false;
    const owner = ownerGroupId ?? ownerOf(resourceType, resourceId);
    const reachedGroups = owner ? new Set(selfAndAncestors(owner)) : new Set();
    return world.restrictions.some((r) => r.type === ARCHIVED && active(r)
      && ((r.resource && r.resource === resourceId) || (r.group && reachedGroups.has(r.group))));
  };

  /** A deleted dataset refuses every mutation and every data-plane read. @see decision 16, row 4 */
  const deletedBlocks = (resourceType, action, resourceId) => {
    if (resourceType !== 'dataset' || !datasets.get(resourceId)?.deleted) return false;
    if (action === 'unarchive') return false;
    const row = tables.actions.dataset[action];
    return row.restriction === 'mutating' || DATA_PLANE_ACTIONS.has(action);
  };

  /** Whether one leaf term holds, and the path it contributes when it does. */
  const termPath = (user, resourceType, resourceId, term) => {
    const owner = ownerOf(resourceType, resourceId);
    const row = resourceRow(resourceType, resourceId);
    switch (term.pathKind) {
      case 'admin':
        return !user.anonymous && adminGroups(user.id).has(owner) ? { kind: 'admin', group: owner } : null;
      case 'oversight':
        return !user.anonymous && overseenGroups(user.id).has(owner) ? { kind: 'oversight', group: owner } : null;
      case 'member': {
        if (user.anonymous || !effectiveGroups(user.id).has(owner)) return null;
        if (term.rule === 'contributions_allowed' && groups.get(owner)?.allow_user_contributions !== true) return null;
        const direct = activeMemberships(user.id).some((m) => m.group === owner);
        return term.rule ? {
          kind: 'member', group: owner, direct, rule: term.rule,
        } : { kind: 'member', group: owner, direct };
      }
      case 'grant':
        if (resourceType === 'group') {
          return !user.anonymous && holdsGrantOnResourceOwnedBy(user, resourceId)
            ? { kind: 'grant', group: resourceId } : null;
        }
        return heldTypes(user, resourceType, resourceId).has(term.accessType)
          ? { kind: 'grant', accessType: term.accessType } : null;
      case 'resource_rule':
        if (term.rule === 'profile_public') {
          return row?.profile_visibility === 'PUBLIC' ? { kind: 'resource_rule', rule: term.rule } : null;
        }
        if (term.rule === 'profile_signed_in') {
          return !user.anonymous && ['PUBLIC', 'AUTHENTICATED'].includes(row?.profile_visibility)
            ? { kind: 'resource_rule', rule: term.rule } : null;
        }
        if (term.rule === 'contributions_allowed') {
          // The model admits a contribution for an effective member of a group that allows it,
          // never for anyone at all. @see access-model.md — The decision rule
          return !user.anonymous && effectiveGroups(user.id).has(owner)
            && groups.get(owner)?.allow_user_contributions === true
            ? {
              kind: 'member',
              group: owner,
              direct: activeMemberships(user.id).some((m) => m.group === owner),
              rule: term.rule,
            }
            : null;
        }
        throw new Error(`reference: unknown resource rule ${term.rule}`);
      case null:
      case undefined:
        if (term.rule === 'always') return { kind: 'always' };
        if (term.rule === 'never' || term.rule === 'platform_admin_only') return null;
        throw new Error(`reference: term ${term.name} carries neither a path kind nor a known rule`);
      default:
        throw new Error(`reference: path kind ${term.pathKind} is not modelled for ${resourceType}`);
    }
  };

  /**
   * `decide(u, a, r)`, restricted to the allowed bit and the paths.
   * @returns {{ allowed: boolean, paths: Object[], blockedBy: string|null }}
   */
  /**
   * The paths the action's terms find, before any restriction or deletion is consulted. A
   * restriction blocks an action; it does not remove the relationship a path records, so the
   * path statement, which reads never restrict, is compared with this.
   */
  const termPaths = (userId, resourceType, action, resourceId) => {
    const user = users.get(userId);
    if (!user) throw new Error(`reference: unknown user ${userId}`);
    const row = tables.actions[resourceType]?.[action];
    if (!row) throw new Error(`reference: unknown action ${resourceType}.${action}`);
    const paths = [];
    if (!user.anonymous && user.platform_admin) paths.push({ kind: 'platform_admin' });
    row.terms.forEach((term) => {
      const p = termPath(user, resourceType, resourceId, term);
      if (p && !paths.some((q) => JSON.stringify(q) === JSON.stringify(p))) paths.push(p);
    });
    return paths;
  };

  const decide = (userId, resourceType, action, resourceId, { ownerGroupId = null } = {}) => {
    if (!MODELLED_RESOURCE_TYPES.includes(resourceType)) {
      throw new Error(`reference: ${resourceType} is not a modelled resource type`);
    }
    const user = users.get(userId);
    if (!user) throw new Error(`reference: unknown user ${userId}`);
    const row = tables.actions[resourceType]?.[action];
    if (!row) throw new Error(`reference: unknown action ${resourceType}.${action}`);
    if (row.operator && row.operator !== 'or') {
      throw new Error(
        `reference: ${resourceType}.${action} uses ${row.operator}, which the model does not read`,
      );
    }

    if (restricted(resourceType, action, resourceId, ownerGroupId)) {
      return { allowed: false, paths: [], blockedBy: ARCHIVED };
    }
    if (deletedBlocks(resourceType, action, resourceId)) return { allowed: false, paths: [], blockedBy: 'DELETED' };

    const paths = termPaths(userId, resourceType, action, resourceId);
    return { allowed: paths.length > 0, paths, blockedBy: null };
  };

  /** Standing: the paths for the resource's read action. */
  const standing = (userId, resourceType, resourceId) => (
    decide(userId, resourceType, 'view_metadata', resourceId).paths
  );

  return {
    decide, termPaths, standing, subjects, heldTypes, effectiveGroups, adminGroups, overseenGroups, restricted,
  };
}

module.exports = { createReference, DATA_PLANE_ACTIONS, MODELLED_RESOURCE_TYPES };
