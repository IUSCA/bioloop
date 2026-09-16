const createError = require('http-errors');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { PrismaHydrator } = require('./hydrators/PrismaHydrator');
const { createDecisionPipeline, filterRestrictedCapabilities } = require('./pipeline');

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
      req.policyContext.cache.user.set(PrismaHydrator.cacheKey('user', req.user.subject_id), req.user);
    }
  }
  next();
}

/**
 * The message a refusal carries. A 404 says nothing a missing resource would not.
 *
 * `blockedBy` is set by whatever restriction checker the application injects. No builtin
 * checker sets it, so the message is `Forbidden` until a restriction type is specified. A
 * resource whose state refuses the action is answered by the service with 409, not here.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */
function refusalMessage({ status, blockedBy }) {
  if (status === 404) return 'Not Found';
  return blockedBy ? `Blocked by a ${blockedBy} restriction` : 'Forbidden';
}

/**
 * The authorization middleware factory. Every decision goes through `createDecisionPipeline`,
 * the same function `authorizeAction` calls.
 *
 * @param {PolicyRegistry} policyRegistry
 * @param {HydratorRegistry} hydratorRegistry
 * @param {Object} [events]
 * @param {Function} [restrictionChecker] - see `createDecisionPipeline`
 * @param {Object} [platformAdmin] - see `createDecisionPipeline`
 * @param {Function} [expandPath] - see `createDecisionPipeline`
 * @param {Object} [options]
 * @param {string[]} [options.concealRefusalsWithoutStanding] - see `createDecisionPipeline`
 */
function createAuthorizationMiddlewareFunction(
  policyRegistry,
  hydratorRegistry,
  events,
  restrictionChecker = null,
  platformAdmin = null,
  expandPath = null,
  { concealRefusalsWithoutStanding = [] } = {},
) {
  const decide = createDecisionPipeline({
    policyRegistry,
    hydratorRegistry,
    events,
    restrictionChecker,
    platformAdmin,
    expandPath,
    concealRefusalsWithoutStanding,
  });

  return _.curry((resourceType, action, {
    requesterFn = (req) => req.user, // default requester extractor from req.user
    resourceIdFn = (req) => req.params?.id, // default resource ID extractor from req.params.id
    preFetchedResourceFn = null, // optional fn(req) => object with pre-fetched resource attributes (e.g. for create actions where the resource does not yet exist)
    shouldDeriveCapabilities = false, // whether to derive capabilities and include them in the policy execution context
    shouldDeriveStanding = false, // whether to derive the caller's standing, as req.permission.standing
  } = {}) => {
    // Fail at setup when the container or the action is missing, rather than returning a
    // middleware that fails on every request.
    const policyContainer = policyRegistry.get(resourceType);
    policyContainer.getPolicy(action);

    const middleware = asyncHandler(async (req, res, next) => {
      const policyExecutionContext = req.policyContext ?? {
        cache: {
          user: new Map(),
          resource: new Map(),
          context: new Map(),
        },
      };

      const permission = await decide(resourceType, action, {
        identifiers: { user: requesterFn(req)?.subject_id, resource: resourceIdFn(req) },
        policyExecutionContext,
        preFetched: {
          user: req.user,
          resource: preFetchedResourceFn ? preFetchedResourceFn(req) : undefined,
          context: { req },
        },
        shouldDeriveCapabilities,
        shouldDeriveStanding,
      });
      if (!permission.granted) {
        return next(createError(permission.status, refusalMessage(permission)));
      }
      req.permission = permission;
      return next();
    });

    // Which policy this middleware enforces, readable from the router stack. An
    // `authorize()` call that names the wrong action is a live enforcement hole that reads
    // as correct, and one did ship: `POST /groups/:id/unarchive` bound `group.archive`, so a
    // group admin could take back the authority archiving gave up. Nothing at runtime reads
    // this; it exists so a test can.
    middleware.authorizes = { resourceType, action };
    return middleware;
  });
}

module.exports = {
  filterRestrictedCapabilities,
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
  refusalMessage,
};
