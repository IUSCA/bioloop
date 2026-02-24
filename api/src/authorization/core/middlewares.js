const createError = require('http-errors');
const { authorize } = require('./authorize');

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

function createAuthorizationMiddlewareFunction(policyRegistry, hydrationRegistry) {
  return (resourceType, action, {
    requesterFn = (req) => req.user, // default requester extractor from req.user
    resourceIdFn = (req) => req.params?.id, // default resource ID extractor from req.params.id
  }) => async (req, res, next) => {
    // get the policy
    const policyContainer = policyRegistry.get(resourceType);
    const policy = policyContainer.getPolicy(action);

    // extract identifiers from the request
    const user = requesterFn(req);
    const userId = user?.id;
    const resourceId = resourceIdFn(req);
    const identifiers = { user: userId, resource: resourceId };

    const policyExecutionContext = req.policyContext || null;

    // call authorize
    const allowed = await authorize({
      policy,
      identifiers,
      registry: hydrationRegistry,
      policyExecutionContext,
      preFetched: {
        user: req.user,
        context: {
          req,
        },
      },
    });
    if (!allowed) {
      return next(createError(403, 'Forbidden'));
    }
    next();
  };
}

module.exports = {
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
};
