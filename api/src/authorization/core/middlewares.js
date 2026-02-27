const createError = require('http-errors');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { authorizeWithFilters } = require('./authorize');

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
  }
  next();
}

function createAuthorizationMiddlewareFunction(policyRegistry, hydrationRegistry, events) {
  return _.curry((resourceType, action, {
    requesterFn = (req) => req.user, // default requester extractor from req.user
    resourceIdFn = (req) => req.params?.id, // default resource ID extractor from req.params.id
    preFetchedResourceFn = null, // optional fn(req) => object with pre-fetched resource attributes (e.g. for create actions where the resource does not yet exist)
  } = {}) => {
    // get the policy
    // fail fast if policy container or policy is not found to avoid returning a middleware that always fails at runtime
    const policyContainer = policyRegistry.get(resourceType);
    const policy = policyContainer.getPolicy(action);
    const attributeRules = policyContainer.getAttributeRules(action);

    return asyncHandler(async (req, res, next) => {
    // extract identifiers from the request
      const user = requesterFn(req);
      const userId = user?.id;
      const resourceId = resourceIdFn(req);
      const identifiers = { user: userId, resource: resourceId };

      const policyExecutionContext = req.policyContext || null;

      // call authorizeWithFilters
      const result = await authorizeWithFilters({
        policy,
        attributeRules,
        identifiers,
        registry: hydrationRegistry,
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
      next();
    });
  });
}

module.exports = {
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
};
