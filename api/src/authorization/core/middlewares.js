const createError = require('http-errors');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { authorizeWithFilters } = require('./authorize');
const { evaluateCapabilitySet, deriveCallerRole } = require('./capabilities');

/**
 * Initializes the policy execution context with request-scoped caches.
 * This middleware should be added early in the request processing pipeline
 * to ensure all authorization checks can benefit from caching.
 */
/**
 * Turn off the capabilities a restriction blocks.
 *
 * `evaluateCapabilitySet` returns a map of action name to boolean, not a list, and the
 * shape has to survive: `toCapabilitiesArray` and the caller-role derivation both read it.
 * So a blocked action is set to false rather than removed.
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

function initializePolicyContext(req, res, next) {
  // check if req has policyContext and if not initialize it to an empty object
  if (!req.policyContext) {
    req.policyContext = {
      cache: {
        user: new Map(),
        resource: new Map(),
        context: new Map(),
      },
    };
    if (req.user) {
      // pre-populate user cache with the requester if available
      req.policyContext.cache.user.set(req.user.subject_id, req.user);
    }
  }
  next();
}

/**
 * @param {PolicyRegistry} policyRegistry
 * @param {HydratorRegistry} hydratorRegistry
 * @param {Object} [events]
 * @param {Function} [restrictionChecker] - Optional
 *   `async ({resourceType, action, resourceId, preFetchedResource}) => string|null`.
 *   Returns the name of a restriction that blocks this action, or null. Injected rather
 *   than imported so the core engine stays free of any knowledge of restrictions.
 *   @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 */
function createAuthorizationMiddlewareFunction(policyRegistry, hydratorRegistry, events, restrictionChecker = null) {
  return _.curry((resourceType, action, {
    requesterFn = (req) => req.user, // default requester extractor from req.user
    resourceIdFn = (req) => req.params?.id, // default resource ID extractor from req.params.id
    preFetchedResourceFn = null, // optional fn(req) => object with pre-fetched resource attributes (e.g. for create actions where the resource does not yet exist)
    shouldDeriveCapabilities = false, // whether to derive capabilities and include them in the policy execution context
    shouldDeriveCallerRole = false, // whether to derive caller role and include it in the policy execution context
  } = {}) => {
    // get the policy
    // fail fast if policy container or policy is not found to avoid returning a middleware that always fails at runtime
    const policyContainer = policyRegistry.get(resourceType);
    const policy = policyContainer.getPolicy(action);
    const attributeRules = policyContainer.getAttributeRules(action);

    return asyncHandler(async (req, res, next) => {
    // extract identifiers from the request
      const user = requesterFn(req);
      const userId = user?.subject_id;
      const resourceId = resourceIdFn(req);
      const identifiers = { user: userId, resource: resourceId };

      const policyExecutionContext = req.policyContext ?? {
        cache: {
          user: new Map(),
          resource: new Map(),
          context: new Map(),
        },
      };

      const preFetchedResource = preFetchedResourceFn ? preFetchedResourceFn(req) : undefined;

      // allowed = no restriction blocks this AND some grant permits it.
      // The restriction half runs first, because it is cheaper and because a blocked action
      // should say what blocked it rather than report a generic authorization failure.
      if (restrictionChecker) {
        const blockedBy = await restrictionChecker({
          resourceType, action, resourceId, preFetchedResource,
        });
        if (blockedBy) {
          return next(createError(403, `Blocked by a ${blockedBy} restriction`));
        }
      }

      // call authorizeWithFilters
      const result = await authorizeWithFilters({
        policy,
        attributeRules,
        identifiers,
        registry: hydratorRegistry,
        policyExecutionContext,
        preFetched: {
          user: req.user,
          resource: preFetchedResource,
          context: {
            req,
          },
        },
        events,
      });
      if (!result.granted) {
        return next(createError(403, 'Forbidden'));
      }
      req.permission = result;

      if (shouldDeriveCapabilities) {
        const capabilities = await evaluateCapabilitySet({
          policyContainer,
          identifiers,
          hydratorRegistry,
          policyExecutionContext,
        });
        // A capability the caller could exercise but a restriction blocks is not a
        // capability. Filtering here keeps the UI from offering a button that 403s.
        req.permission.capabilities = restrictionChecker
          ? await filterRestrictedCapabilities({
            capabilities, resourceType, resourceId, preFetchedResource, restrictionChecker,
          })
          : capabilities;
      }
      if (shouldDeriveCallerRole) {
        const callerRole = await deriveCallerRole({
          policyContainer, identifiers, hydratorRegistry, policyExecutionContext,
        });
        req.permission.callerRole = callerRole;
      }

      next();
    });
  });
}

module.exports = {
  filterRestrictedCapabilities,
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
};
