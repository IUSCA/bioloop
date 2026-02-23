// const logger = require('@/services/logger');
const { HydratorRegistry } = require('./hydrators');
const Policy = require('./policies/base/policy');

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
 * @param {Policy} policy - The authorization policy to evaluate.
 * @param {Object} identifiers - The identifiers for hydration.
 * @param {string|number} identifiers.user - The user identifier.
 * @param {string|number} identifiers.resource - The resource identifier.
 * @param {string|number} identifiers.context - The context identifier.
 * @param {HydratorRegistry} registry - The service registry for obtaining hydrators.
 * @param {Object} [policyExecutionContext=null] - Optional execution context containing cached data.
 * @param {Object} [policyExecutionContext.cache] - Cached hydration data.
 * @param {Object} [policyExecutionContext.cache.user] - Cached user data.
 * @param {Object} [policyExecutionContext.cache.resource] - Cached resource data.
 * @param {Object} [policyExecutionContext.cache.context] - Cached context data.
 * @returns {Promise<boolean>} The authorization decision result.
 */
async function authorize(policy, identifiers, registry, policyExecutionContext = null) {
  if (!policy || !(policy instanceof Policy)) {
    throw new AuthorizationError('Invalid policy: must be an instance of Policy');
  }
  if (!identifiers || typeof identifiers !== 'object') {
    throw new AuthorizationError(`[policy:${policy.name}] Invalid identifiers: must be an object`);
  }
  if (!registry || !(registry instanceof HydratorRegistry)) {
    throw new AuthorizationError(`[policy:${policy.name}] Invalid registry: must be an instance of HydratorRegistry`);
  }
  if (identifiers.user === null || identifiers.user === undefined) {
    throw new AuthorizationError(`[policy:${policy.name}] User identifier is required to evaluate policy`);
  }

  const userHydrator = registry.get('user');

  let resourceHydrator = null;
  if (policy.resourceType !== null) {
    if (identifiers.resource === null || identifiers.resource === undefined) {
      throw new AuthorizationError(
        `[policy:${policy.name}] Resource identifier is required to evaluate policy which requires resource attributes`,
      );
    }
    resourceHydrator = registry.get(policy.resourceType);
  }

  // Context hydrator is optional - only use if registered
  let contextHydrator = null;
  if (registry.has('context')) {
    contextHydrator = registry.get('context');
  }

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: policy.requires.user,
      cache: policyExecutionContext?.cache?.user || new Map(),
    }),

    resourceHydrator ? resourceHydrator.hydrate({
      id: identifiers.resource,
      attributes: policy.requires.resource,
      cache: policyExecutionContext?.cache?.resource || new Map(),
    }) : {},

    contextHydrator && identifiers.context ? contextHydrator.hydrate({
      id: identifiers.context,
      attributes: policy.requires.context,
      cache: policyExecutionContext?.cache?.context || new Map(),
    }) : {},
  ]);

  // console.debug('user:', JSON.stringify(user, null, 2), { isHydrated: true });
  // console.debug('resource:', JSON.stringify(resource, null, 2), { isHydrated: resourceHydrator !== null });
  // console.debug('context:', JSON.stringify(context, null, 2), { isHydrated: contextHydrator !== null });

  return policy.evaluate(user, resource, context);
}

module.exports = { authorize };
