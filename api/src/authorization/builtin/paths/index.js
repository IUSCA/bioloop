/**
 * The access rule as SQL: every path by which a user reaches a resource.
 *
 * Each resource type that decides from paths registers a paths file, in `authorization/index.js`.
 * A paths file exports `{ resourceType, sql, prospectiveKinds }`:
 *
 * - `sql(userId, { resourceIds, accessTypes })` returns a statement with one row per path. It
 *   may read the `subjects` CTE, which `accessPathsQuery` defines.
 * - `prospectiveKinds`, optional, lists the path kinds a create of the type can have.
 *
 * Every row has the columns `resource_id`, `path_kind`, `group_id`, `grant_id`, `collection_id`,
 * `access_type`, and `direct`, which a `member` row sets when the membership is in the group
 * itself rather than a descendant. `path_kind` is one of `PATH_KINDS`:
 *
 * - `admin`: an active ADMIN membership in the owning group, or in the group itself.
 *   Authority does not flow down the tree.
 * - `oversight`: the owning group, or the group itself, is a strict descendant of a group the
 *   user administers.
 * - `member`: the user is an effective member of the group, directly or through a descendant.
 * - `grant`: a valid grant reaching the user, addressed to the user, a group they effectively
 *   belong to, or a system principal.
 *
 * A list joins on the statement before paging, a single check binds one resource id, and
 * standing is the set of rows for one resource. The platform admin, restrictions, projection,
 * and terms that name no resource stay outside the statement.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 * @see docs/design/groups/access-model.md — Paths and standing
 */

const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { subjectSetSql } = require('@/services/grants/helpers');
const accessTypeClosure = require('@/services/grants/accessTypeClosure');

const PATH_KINDS = ['admin', 'oversight', 'member', 'grant'];

/** The paths files registered by resource type. */
class PathRegistry {
  constructor() {
    this.paths = new Map();
  }

  /** @param {{ resourceType: string, sql: Function, prospectiveKinds?: string[] }} paths */
  register(paths) {
    if (!paths?.resourceType || typeof paths.resourceType !== 'string') {
      throw new Error('PathRegistry: paths must name a resourceType');
    }
    if (typeof paths.sql !== 'function') {
      throw new Error(`PathRegistry: the paths for ${paths.resourceType} have no sql builder`);
    }
    const { prospectiveKinds } = paths;
    if (prospectiveKinds !== undefined
      && (!Array.isArray(prospectiveKinds) || !prospectiveKinds.length
        || prospectiveKinds.some((kind) => !PATH_KINDS.includes(kind)))) {
      throw new Error(
        `PathRegistry: prospectiveKinds for ${paths.resourceType} must be a non-empty subset of `
        + `${PATH_KINDS.join(', ')}`,
      );
    }
    if (this.paths.has(paths.resourceType)) {
      throw new Error(`PathRegistry: paths for ${paths.resourceType} are already registered`);
    }
    this.paths.set(paths.resourceType, paths);
  }

  get(resourceType) {
    const paths = this.paths.get(resourceType);
    if (!paths) throw new Error(`access paths: no paths are registered for resource type ${resourceType}`);
    return paths;
  }

  has(resourceType) {
    return this.paths.has(resourceType);
  }

  listTypes() {
    return [...this.paths.keys()];
  }

  /**
   * Throws at startup when a registration cannot work: paths for a type no policy container
   * declares, or prospective kinds with no group paths to read them from.
   * @param {import('../../core/policies/PolicyRegistry')} policyRegistry
   */
  assertValid(policyRegistry) {
    const registeredPolicyTypes = policyRegistry.listTypes();
    const orphans = this.listTypes().filter((type) => !registeredPolicyTypes.includes(type));
    if (orphans.length) {
      throw new Error(`PathRegistry: paths registered for types with no policy container: ${orphans.join(', ')}`);
    }
    const creatable = [...this.paths.values()].filter((paths) => paths.prospectiveKinds).map((p) => p.resourceType);
    if (creatable.length && !this.has('group')) {
      throw new Error(
        `PathRegistry: ${creatable.join(', ')} declare prospectiveKinds, which read group paths, `
        + 'and no group paths are registered',
      );
    }
  }
}

const pathRegistry = new PathRegistry();

/**
 * Builds the SQL that returns every path from one user to resources of one type, one row per
 * path, with the columns described at the top of this file.
 *
 * The statement first defines the `subjects` CTE from `subjectSetSql`: the user, every group they
 * effectively belong to, and the system principals, or only `Public` for an anonymous caller. The
 * grant arms match grants held by any of these. It then appends the registered type's `sql`.
 *
 * Nothing runs here. The caller executes the SQL, or embeds it in a larger query.
 *
 * @param {Object} args
 * @param {string} args.userId - a user's subject id, or PUBLIC_GROUP_ID for an anonymous caller
 * @param {string} args.resourceType - a type with registered paths
 * @param {string[]} [args.resourceIds] - restrict to these resources; omit for a list
 * @param {string[]} [args.accessTypes] - grant rows only of these types, already widened by
 *   `satisfiedBy`; omit for every type
 * @returns {Prisma.Sql} a statement selecting the path columns, usable as a subquery
 */
function accessPathsQuery({
  userId, resourceType, resourceIds = null, accessTypes = null,
}) {
  const { sql } = pathRegistry.get(resourceType);
  if (!userId) throw new Error('accessPathsQuery: a user is required');
  if (resourceIds && resourceIds.length === 0) throw new Error('accessPathsQuery: resourceIds is empty');
  if (accessTypes && accessTypes.length === 0) throw new Error('accessPathsQuery: accessTypes is empty');
  return Prisma.sql`
    WITH subjects AS (${subjectSetSql(userId)})
    ${sql(userId, { resourceIds, accessTypes })}
  `;
}

/**
 * Builds the SQL that returns the ids of the resources a user can reach, one row per resource.
 *
 * It runs `accessPathsQuery`, keeps the paths whose kind is in `pathKinds`, and returns each
 * remaining `resource_id` once, however many paths reach it. A list search embeds it to limit
 * its rows to what the caller reaches. For example, `pathKinds: ['admin', 'oversight']` returns
 * only the resources the user governs, and ignores their memberships and grants.
 *
 * @param {Object} args - as `accessPathsQuery`, plus the two below
 * @param {string[]} [args.pathKinds] - the path kinds that count; defaults to every kind
 * @param {Prisma.Sql} [args.restrictionPredicate] - an extra condition on each path row `p`;
 *   defaults to `TRUE`
 * @returns {Prisma.Sql} a statement selecting one `resource_id` column
 */
function accessibleIdsQuery({
  pathKinds = PATH_KINDS, restrictionPredicate = Prisma.sql`TRUE`, ...args
}) {
  if (!pathKinds.length) throw new Error('accessibleIdsQuery: pathKinds is empty');
  return Prisma.sql`
    SELECT DISTINCT p.resource_id
    FROM (${accessPathsQuery(args)}) p
    WHERE p.path_kind IN (${Prisma.join(pathKinds)})
      AND ${restrictionPredicate}
  `;
}

/**
 * The `access_paths` value for a set of path rows.
 * @param {Object[]} rows - rows of `accessPathsQuery` for one resource
 * @returns {Promise<{rows: Object[], kinds: Set<string>, access_types: Set<string>}>}
 */
async function summarizePaths(rows) {
  const granted = rows.filter((r) => r.path_kind === 'grant').map((r) => r.access_type);
  return {
    rows,
    kinds: new Set(rows.map((r) => r.path_kind)),
    access_types: await accessTypeClosure.expand(granted),
  };
}

/**
 * One user's paths to one resource, as the builtin terms read them.
 *
 * With a resource id, the rows are `accessPathsQuery` bound to that id. Without one, the check
 * is a create. A create names only its owning group, so it has no grant, and the rows are that
 * group's rows limited to the type's `prospectiveKinds`.
 *
 * @param {Object} id - the context identifiers `{ user, resourceType, resource, prospective }`
 * @returns {Promise<{rows: Object[], kinds: Set<string>, access_types: Set<string>}>}
 *   `access_types` holds the grant rows' types widened through the implication closure.
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */
async function loadAccessPaths({
  user, resourceType, resource, prospective,
}) {
  const { prospectiveKinds } = pathRegistry.get(resourceType);
  let rows = [];
  if (user && resource != null) {
    rows = await prisma.$queryRaw(accessPathsQuery({ userId: user, resourceType, resourceIds: [resource] }));
  } else if (user && prospective?.owner_group_id && prospectiveKinds) {
    const groupRows = await prisma.$queryRaw(accessPathsQuery({
      userId: user, resourceType: 'group', resourceIds: [prospective.owner_group_id],
    }));
    rows = groupRows.filter((r) => prospectiveKinds.includes(r.path_kind));
  }
  return summarizePaths(rows);
}

/**
 * One user's `access_paths` for each of several resources, from one statement.
 *
 * A list decides every row it returns. Seeding each row's check with its value keeps the list
 * at one path query, and the rows agree with the detail route because the statement is the same.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.resourceType
 * @param {string[]} args.resourceIds - not empty
 * @returns {Promise<Map<string, Object>>} an entry for every id, with no rows where nothing reaches it
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */
async function accessPathsByResource({ userId, resourceType, resourceIds }) {
  const rows = await prisma.$queryRaw(accessPathsQuery({ userId, resourceType, resourceIds }));
  const byId = new Map(resourceIds.map((id) => [id, []]));
  rows.forEach((row) => byId.get(row.resource_id)?.push(row));
  const entries = await Promise.all([...byId].map(async ([id, own]) => [id, await summarizePaths(own)]));
  return new Map(entries);
}

module.exports = {
  PathRegistry,
  pathRegistry,
  PATH_KINDS,
  accessPathsQuery,
  accessibleIdsQuery,
  loadAccessPaths,
  accessPathsByResource,
};
