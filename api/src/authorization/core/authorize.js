// const logger = require('@/services/logger');
const { HydratorRegistry } = require('./hydrators/HydratorRegistry');
const Policy = require('./policies/Policy');
const { evaluateAttributeFilters, createFilterFunction } = require('./attributeFilters');

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Authorizes access based on a policy by evaluating user, resource, and context data.
 *
 * @async
 * @param {Object} options - Authorization options object.
 * @param {Policy} options.policy - The authorization policy to evaluate.
 * @param {Object} options.identifiers - The identifiers for hydration.
 * @param {string|number} options.identifiers.user - The user identifier.
 * @param {string|number} options.identifiers.resource - The resource identifier.
 * @param {HydratorRegistry} options.registry - The service registry for obtaining hydrators.
 * @param {Object} [options.policyExecutionContext=null] - Optional execution context containing cached data.
 * @param {Object} [options.policyExecutionContext.cache] - Cached hydration data.
 * @param {Object} [options.policyExecutionContext.cache.user] - Cached user data.
 * @param {Object} [options.policyExecutionContext.cache.resource] - Cached resource data.
 * @param {Object} [options.preFetched=null] - Optional pre-fetched data to use instead of hydrating.
 * @param {Object} [options.preFetched.user] - Pre-fetched user data.
 * @param {Object} [options.preFetched.resource] - Pre-fetched resource data.
 * @param {Object} [options.preFetched.context] - Pre-fetched context data.
 * @returns {Promise<boolean>} The authorization decision result.
 */
async function authorize({
  policy, identifiers, registry, policyExecutionContext = null, preFetched = null,
}) {
  if (!policy || !(policy instanceof Policy)) {
    throw new AuthorizationError('Invalid policy: must be an instance of Policy');
  }
  if (!identifiers || typeof identifiers !== 'object') {
    throw new AuthorizationError(`[policy:${policy.name}] Invalid identifiers: must be an object`);
  }
  if (!registry || !(registry instanceof HydratorRegistry)) {
    throw new AuthorizationError(`[policy:${policy.name}] Invalid registry: must be an instance of HydratorRegistry`);
  }
  if (identifiers.user == null) {
    throw new AuthorizationError(`[policy:${policy.name}] User identifier is required to evaluate policy`);
  }

  const userHydrator = registry.get('user');
  const contextHydrator = registry.get('context');

  let resourceHydrator = null;
  if (policy.resourceType != null) {
    if (identifiers.resource == null) {
      throw new AuthorizationError(
        `[policy:${policy.name}] Resource identifier is required to evaluate policy which requires resource attributes`,
      );
    }
    resourceHydrator = registry.get(policy.resourceType);
  }

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: policy.requires.user,
      cache: policyExecutionContext?.cache?.user || new Map(),
      preFetched: preFetched?.user,
    }),

    resourceHydrator ? resourceHydrator.hydrate({
      id: identifiers.resource,
      attributes: policy.requires.resource,
      cache: policyExecutionContext?.cache?.resource || new Map(),
      preFetched: preFetched?.resource,
    }) : {},

    contextHydrator.hydrate({
      id: null,
      attributes: policy.requires.context,
      cache: policyExecutionContext?.cache?.context || new Map(),
      preFetched: preFetched?.context,
    }),
  ]);

  // console.debug('user:', JSON.stringify(user, null, 2));
  // console.debug('resource:', JSON.stringify(resource, null, 2), { isHydrated: resourceHydrator !== null });
  // console.debug('context:', JSON.stringify(context, null, 2));

  return policy.evaluate(user, resource, context);
}

/**
 * Authorizes access with attribute filtering support
 * Phase 1: Evaluates action policy (reuses standard authorize logic)
 * Phase 2: If granted, evaluates attribute filter rules with incremental hydration
 *
 * @async
 * @param {Policy} actionPolicy - The authorization policy for the action
 * @param {Array} attributeRules - Array of attribute filter rules from PolicyContainer
 * @param {Object} identifiers - The identifiers for hydration
 * @param {string|number} identifiers.user - User identifier
 * @param {string|number} identifiers.resource - Resource identifier
 * @param {HydratorRegistry} registry - The service registry for obtaining hydrators
 * @param {Object} [policyExecutionContext=null] - Optional execution context with cached data
 * @param {Object} [policyExecutionContext.cache] - Cached hydration data
 * @param {Map} [policyExecutionContext.cache.user] - User cache Map
 * @param {Map} [policyExecutionContext.cache.resource] - Resource cache Map
 * @param {Map} [policyExecutionContext.cache.context] - Context cache Map
 * @param {Object} [preFetched=null] - Optional pre-fetched data to use instead of hydrating
 * @param {Object} [preFetched.user] - Pre-fetched user data
 * @param {Object} [preFetched.resource] - Pre-fetched resource data
 * @param {Object} [preFetched.context] - Pre-fetched context data
 * @param {Object} [events={}] - Optional events configuration
 * @param {Function} [events.emit] - Event emitter function
 * @param {string} [events.eventToEmit] - Event name to emit after authorization decision
 * @returns {Promise<Object>} Authorization result
 * @returns {boolean} result.granted - Whether access is granted
 * @returns {Function|null} result.filter - Filter function to apply to resource objects
 *                                          Returns null if access denied
 *
 * @example
 * const result = await authorizeWithFilters(
 *   groupPolicies.getPolicy('view_metadata'),
 *   groupPolicies.getAttributeRules('view_metadata'),
 *   { user: req.user.id, resource: req.params.groupId },
 *   hydratorRegistry,
 *   req.policyContext
 * );
 * if (result.granted) {
 *   const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
 *   res.json(result.filter(group));
 * }
 */
async function authorizeWithFilters({
  policy,
  attributeRules,
  identifiers,
  registry,
  policyExecutionContext = null,
  preFetched = null,
  events = {
    emit: null,
    eventToEmit: null,
  },
}) {
  // Validate inputs
  if (!policy || !(policy instanceof Policy)) {
    throw new AuthorizationError('Invalid policy: must be an instance of Policy');
  }
  if (!Array.isArray(attributeRules)) {
    throw new AuthorizationError('Invalid attributeRules: must be an array');
  }
  if (!identifiers || typeof identifiers !== 'object') {
    throw new AuthorizationError(
      `[policy:${policy.name}] Invalid identifiers: must be an object`,
    );
  }
  if (!registry || !(registry instanceof HydratorRegistry)) {
    throw new AuthorizationError(
      `[policy:${policy.name}] Invalid registry: must be an instance of HydratorRegistry`,
    );
  }
  if (identifiers.user === null || identifiers.user === undefined) {
    throw new AuthorizationError(
      `[policy:${policy.name}] User identifier is required to evaluate policy`,
    );
  }
  // validate events configuration
  let emitEvent = false;
  if (events.emit && typeof events.emit !== 'function') {
    throw new AuthorizationError('Invalid events.emit: must be a function');
  }
  if (events.eventToEmit && typeof events.eventToEmit !== 'string') {
    throw new AuthorizationError('Invalid events.eventToEmit: must be a string');
  }
  if (events.emit && events.eventToEmit) {
    emitEvent = true;
  }

  // Initialize caches if not provided
  const caches = {
    user: policyExecutionContext?.cache?.user || new Map(),
    resource: policyExecutionContext?.cache?.resource || new Map(),
    context: policyExecutionContext?.cache?.context || new Map(),
  };

  const userHydrator = registry.get('user');
  const contextHydrator = registry.get('context');

  let resourceHydrator = null;
  if (policy.resourceType != null) {
    if (identifiers.resource == null) {
      throw new AuthorizationError(
        `[policy:${policy.name}] Resource identifier is required to evaluate policy which requires resource attributes`,
      );
    }
    resourceHydrator = registry.get(policy.resourceType);
  }

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: policy.requires.user,
      cache: caches.user,
      preFetched: preFetched?.user,
    }),

    resourceHydrator ? resourceHydrator.hydrate({
      id: identifiers.resource,
      attributes: policy.requires.resource,
      cache: caches.resource,
      preFetched: preFetched?.resource,
    }) : {},

    contextHydrator.hydrate({
      id: null,
      attributes: policy.requires.context,
      cache: caches.context,
      preFetched: preFetched?.context,
    }),
  ]);

  // Evaluate action policy
  const actionGranted = await policy.evaluate(user, resource, context);

  // If action denied, return immediately (no need to evaluate attribute filters)
  if (!actionGranted) {
    if (emitEvent) {
      events.emit(events.eventToEmit, {
        policy: policy.name,
        identifiers,
        granted: false,
        context,
      });
    }
    return {
      granted: false,
      filter: null,
    };
  }

  // PHASE 2: Action granted - evaluate attribute filtering rules
  // This reuses the caches populated in Phase 1 and does incremental hydration
  const hydrators = {
    user: userHydrator,
    resource: resourceHydrator,
    context: contextHydrator,
  };

  const attributeFilters = await evaluateAttributeFilters(
    attributeRules,
    identifiers,
    hydrators,
    caches,
  );

  // Create the filter function
  const filterFunction = createFilterFunction(attributeFilters);

  if (emitEvent) {
    events.emit(events.eventToEmit, {
      policy: policy.name,
      identifiers,
      granted: true,
      context,
    });
  }

  return {
    granted: true,
    filter: filterFunction,
  };
}

module.exports = {
  authorize,
  authorizeWithFilters,
};
