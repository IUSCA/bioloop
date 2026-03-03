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

function createAuthorizationMiddlewareFunction(policyRegistry, hydratorRegistry, events) {
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

      // call authorizeWithFilters
      const result = await authorizeWithFilters({
        policy,
        attributeRules,
        identifiers,
        registry: hydratorRegistry,
        policyExecutionContext,
        preFetched: {
          user: req.user,
          resource: preFetchedResourceFn ? preFetchedResourceFn(req) : undefined,
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
        req.permission.capabilities = capabilities;
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
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
};
