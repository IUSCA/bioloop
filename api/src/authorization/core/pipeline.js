const { authorizeWithFilters } = require('./authorize');
const Policy = require('./policies/Policy');
const { evaluateCapabilitySet, deriveStanding } = require('./capabilities');

/**
 * Turn off the capabilities a restriction blocks.
 *
 * `evaluateCapabilitySet` returns a map of action name to boolean, not a list, and the
 * shape has to survive: `toCapabilitiesArray` reads it. So a blocked action is set to false
 * rather than removed.
 *
 * Only actions that are currently true are checked, because a capability the policy already
 * denied cannot be blocked any further. The checker short-circuits on reading actions
 * without touching the database, so most entries cost nothing.
 *
 * @param {Object} params
 * @param {Object<string, boolean>} params.capabilities
 * @returns {Promise<Object<string, boolean>>}
 */
async function filterRestrictedCapabilities({
  capabilities, resourceType, resourceId, preFetchedResource, restrictionChecker,
}) {
  const filtered = { ...capabilities };

  for (const [action, granted] of Object.entries(filtered)) {
    if (granted) {
      // eslint-disable-next-line no-await-in-loop
      const blockedBy = await restrictionChecker({
        resourceType, action, resourceId, preFetchedResource,
      });
      if (blockedBy) filtered[action] = false;
    }
  }
  return filtered;
}

/**
 * The attribute rule the platform-admin short-circuit evaluates with: everything, always.
 *
 * `createFilterFunction` treats an empty filter list as deny-all, so a short-circuit that
 * passed no rules would grant the action and then hand back an object with no fields.
 */
const ALL_ATTRIBUTES = [{ policy: Policy.always, attribute_filters: ['*'] }];

/**
 * The decision pipeline. The authorization middleware and `authorizeAction` both call the
 * function this returns, so the two cannot answer the same question differently.
 *
 * 1. The restriction checker. A blocked action is refused whoever asks, platform admin included.
 * 2. The platform-admin policy. When it grants, the action's own policy is not consulted.
 * 3. The action's policy and attribute rules.
 *
 * After a grant, capabilities and standing are derived when asked for. Capabilities pass
 * through the restriction checker on both branches.
 *
 * A refusal carries `status`. For a resource type listed in `concealRefusalsWithoutStanding`, a
 * refusal on a named resource is 404 when the caller holds no standing on it, and 403 when they
 * do. Every other container answers 403: its id may name a resource of another type, such as the
 * dataset whose grants are listed, and its own terms say nothing about standing on that resource.
 *
 * @param {Object} params
 * @param {PolicyRegistry} params.policyRegistry
 * @param {HydratorRegistry} params.hydratorRegistry
 * @param {Object} [params.events]
 * @param {Function} [params.restrictionChecker] -
 *   `async ({resourceType, action, resourceId, preFetchedResource}) => string|null`.
 *   Injected rather than imported so the core engine stays free of any knowledge of restrictions.
 *   @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 * @param {Object} [params.platformAdmin] - `{ policy }`, an application fact for the same reason.
 *   @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 * @param {Function} [params.expandPath] - `(term, entities) => paths`, passed to `deriveStanding`.
 * @param {string[]} [params.concealRefusalsWithoutStanding] - resource types whose refusals are concealed
 * @returns {function(string, string, Object): Promise<Object>}
 * @see docs/design/groups/implementation/access-model-verification-plan.md — One pipeline
 * @see docs/design/groups/access-model.md — Refusal shapes
 */
function createDecisionPipeline({
  policyRegistry,
  hydratorRegistry,
  events,
  restrictionChecker = null,
  platformAdmin = null,
  expandPath = null,
  concealRefusalsWithoutStanding = [],
}) {
  const evaluateAdmin = ({ identifiers, policyExecutionContext, preFetched }) => authorizeWithFilters({
    policy: platformAdmin.policy,
    attributeRules: ALL_ATTRIBUTES,
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });

  const standingOf = (policyContainer, { identifiers, policyExecutionContext, preFetched }) => deriveStanding({
    policyContainer, identifiers, hydratorRegistry, policyExecutionContext, preFetched, expandPath,
  });

  const restrict = (capabilities, { resourceType, identifiers, preFetched }) => (restrictionChecker
    ? filterRestrictedCapabilities({
      capabilities,
      resourceType,
      resourceId: identifiers.resource,
      preFetchedResource: preFetched?.resource,
      restrictionChecker,
    })
    : capabilities);

  /**
   * A refusal, with `status` 404 for a caller who holds no standing on the named resource and
   * 403 otherwise. Standing is attached when asked for, because a caller refused one action may
   * still stand on the resource, as a reader of its public profile does.
   */
  async function refuse(policyContainer, request, fields, shouldDeriveStanding) {
    const { identifiers } = request;
    const refusal = { ...fields, granted: false, status: 403 };
    const named = identifiers.resource != null && identifiers.user != null;
    const conceal = named && concealRefusalsWithoutStanding.includes(request.resourceType);
    if (identifiers.user == null || !(conceal || shouldDeriveStanding)) return refusal;

    const isAdmin = Boolean(platformAdmin) && (await evaluateAdmin(request)).granted;
    const standing = await standingOf(policyContainer, request);
    if (shouldDeriveStanding) refusal.standing = isAdmin ? [{ kind: 'platform_admin' }, ...standing] : standing;
    if (conceal && !isAdmin && standing.length === 0) refusal.status = 404;
    return refusal;
  }

  return async function decide(resourceType, action, {
    identifiers,
    policyExecutionContext = null,
    preFetched = null,
    shouldDeriveCapabilities = false,
    shouldDeriveStanding = false,
  }) {
    const policyContainer = policyRegistry.get(resourceType);
    const policy = policyContainer.getPolicy(action);
    const request = {
      resourceType, identifiers, policyExecutionContext, preFetched,
    };

    // allowed = no restriction blocks this AND some grant permits it. The restriction half
    // runs first, so a blocked action says what blocked it.
    if (restrictionChecker) {
      const blockedBy = await restrictionChecker({
        resourceType, action, resourceId: identifiers.resource, preFetchedResource: preFetched?.resource,
      });
      if (blockedBy) return refuse(policyContainer, request, { filter: null, blockedBy }, shouldDeriveStanding);
    }

    if (platformAdmin) {
      const permission = await evaluateAdmin(request);
      if (permission.granted) {
        if (shouldDeriveCapabilities) {
          // Every action, less those a restriction blocks. What the resource's state admits is
          // a separate answer, reported beside this one.
          // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
          permission.capabilities = await restrict(
            Object.fromEntries(policyContainer.getActionNames().map((name) => [name, true])),
            request,
          );
        }
        if (shouldDeriveStanding) {
          permission.standing = [{ kind: 'platform_admin' }].concat(await standingOf(policyContainer, request));
        }
        return permission;
      }
    }

    const permission = await authorizeWithFilters({
      policy,
      attributeRules: policyContainer.getAttributeRules(action),
      identifiers,
      registry: hydratorRegistry,
      policyExecutionContext,
      preFetched,
      events,
    });
    if (!permission.granted) return refuse(policyContainer, request, permission, shouldDeriveStanding);

    if (shouldDeriveCapabilities) {
      // A capability the caller could exercise but a restriction blocks is not a capability,
      // so the UI is never offered a button that refuses.
      permission.capabilities = await restrict(await evaluateCapabilitySet({
        policyContainer, identifiers, hydratorRegistry, policyExecutionContext,
      }), request);
    }
    if (shouldDeriveStanding) {
      permission.standing = await standingOf(policyContainer, request);
    }
    return permission;
  };
}

module.exports = {
  createDecisionPipeline,
  filterRestrictedCapabilities,
};
