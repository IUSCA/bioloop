/**
 * Helpers a route handler calls around a list: whether the caller is a platform admin, what
 * fields a list row shows, and what each row's badges and controls are.
 *
 * `authorization/index.js` builds them once with its decision pipeline, so they decide exactly
 * as the middleware does.
 *
 * @see docs/design/groups/access-model.md — Projection
 */

const { filterRestrictedCapabilities } = require('../core/pipeline');
const { toCapabilitiesArray } = require('../core/capabilities');
const { accessPathsByResource, pathRegistry } = require('./paths');
const { standingFromPathRows } = require('./paths/standing');

/**
 * @param {Object} deps
 * @param {Function} deps.decide - the decision pipeline
 * @param {Function} deps.restrictionChecker
 * @param {import('../core/hydrators/BaseHydrator').Hydrator} deps.userHydrator
 * @param {import('../core/policies/Policy')} deps.isPlatformAdmin
 */
function createListHelpers({
  decide, restrictionChecker, userHydrator, isPlatformAdmin,
}) {
  /**
   * Whether the caller is a platform admin, read from `user_role` the way the engine reads it.
   *
   * A list handler asks this to choose between the unfiltered query and the one scoped to the
   * caller. Reading the session's roles instead kept a demoted admin's unfiltered lists until
   * the token expired. The request's policy context caches the answer.
   *
   * @param {import('express').Request} req
   * @returns {Promise<boolean>}
   * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 14
   */
  async function callerIsPlatformAdmin(req) {
    const id = req.user?.subject_id;
    if (!id || req.user.is_anonymous) return false;
    const user = await userHydrator.hydrate({
      id, attributes: ['current_roles'], cache: req.policyContext?.cache?.user ?? new Map(),
    });
    return isPlatformAdmin.evaluate(user);
  }

  /**
   * The field filter of the caller's `list` decision on a resource type.
   *
   * A route that returns rows related to the resource it names, such as a group's ancestors, uses
   * this. Its own decision is about the named resource and says nothing about the related rows.
   *
   * @param {import('express').Request} req
   * @param {string} resourceType
   * @returns {Promise<(row: Object) => Object>}
   * @see docs/design/groups/access-model.md — Projection
   */
  async function listFilter(req, resourceType) {
    const permission = await decide(resourceType, 'list', {
      identifiers: { user: req.user?.subject_id },
      policyExecutionContext: req.policyContext,
      preFetched: { user: req.user },
    });
    return permission.filter;
  }

  /**
   * Each list row's `_meta`: the capabilities and standing the detail route reports for it.
   *
   * Every row is decided with the detail route's composition: the detail action with
   * capabilities and standing, less the capabilities a restriction in force blocks. A row the
   * caller cannot open lacks the detail action, which is how a collection's datasets tab tells
   * the two apart. For a dataset, a collection, or a group, the page's paths are read once and
   * seed every row.
   *
   * @param {string} resourceType
   * @param {Object[]} rows - the list's rows, unprojected, used to seed each check
   * @param {Object} options
   * @param {import('express').Request} options.req
   * @param {(row: Object) => string} options.idOf - the id a check binds: `resource_id` for a dataset
   * @param {string} [options.action] - the action the detail route authorizes
   * @returns {Promise<Array<{capabilities: string[], standing: Object[]}>>} in row order
   * @see docs/design/groups/access-model.md — Paths and standing
   */
  async function decideRows(resourceType, rows, { req, idOf, action = 'view_metadata' }) {
    if (!rows.length) return [];
    const user = req.user?.subject_id;
    const ids = rows.map(idOf);
    const batched = pathRegistry.has(resourceType);
    const pathsById = batched && user && !req.user.is_anonymous
      ? await accessPathsByResource({ userId: user, resourceType, resourceIds: ids })
      : null;

    const metas = [];
    // One row at a time, so the first check fills the shared policy context for the rest.
    for (const [index, row] of rows.entries()) {
      const id = ids[index];
      // eslint-disable-next-line no-await-in-loop
      const decision = await decide(resourceType, action, {
        identifiers: { user, resource: id },
        policyExecutionContext: req.policyContext,
        preFetched: {
          user: req.user,
          resource: row,
          context: pathsById ? { access_paths: pathsById.get(id) } : undefined,
        },
        shouldDeriveCapabilities: true,
        shouldDeriveStanding: true,
      });
      // eslint-disable-next-line no-await-in-loop
      const capabilities = await filterRestrictedCapabilities({
        capabilities: decision.capabilities ?? {},
        resourceType,
        resourceId: id,
        preFetchedResource: row,
        restrictionChecker,
      });
      metas.push({ capabilities: toCapabilitiesArray(capabilities), standing: decision.standing ?? [] });
    }
    return metas;
  }

  /**
   * The caller's standing on each row of a list, from one path statement for the whole page.
   *
   * The standing is the path rows alone: admin, oversight, member, and grant. It omits the
   * platform-admin path, which a list badge leaves out anyway, and the resource-rule paths. A
   * caller's own search is scoped to path rows, so only a platform admin's unscoped search has rows
   * a resource rule alone reaches, and those rows carry no badge.
   *
   * @param {import('express').Request} req
   * @param {string} resourceType - a dataset, a collection, or a group
   * @param {string[]} ids - the rows' resource ids, in row order
   * @returns {Promise<Object[][]>} one standing per id, in the same order; empty for an anonymous caller
   * @see docs/design/groups/access-model.md — The badge vocabulary
   */
  async function standingOfRows(req, resourceType, ids) {
    const user = req.user?.subject_id;
    if (!ids.length || !user || req.user.is_anonymous) return ids.map(() => []);
    const pathsById = await accessPathsByResource({ userId: user, resourceType, resourceIds: ids });
    return ids.map((id) => standingFromPathRows(pathsById.get(id).rows));
  }

  return {
    callerIsPlatformAdmin, listFilter, decideRows, standingOfRows,
  };
}

module.exports = { createListHelpers };
