// authorize.js

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
  const userHydrator = registry.get('user');

  let resourceHydrator = null;
  if (policy.resourceType !== null) {
    resourceHydrator = registry.get(policy.resourceType);
  }
  const contextHydrator = registry.get('context');

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: policy.requires.user,
      cache: policyExecutionContext?.cache.user,
    }),

    resourceHydrator ? resourceHydrator.hydrate({
      id: identifiers.resource,
      attributes: policy.requires.resource,
      cache: policyExecutionContext?.cache.resource,
    }) : null,

    contextHydrator.hydrate({
      id: identifiers.context,
      attributes: policy.requires.context,
      cache: policyExecutionContext?.cache.context,
    }),
  ]);

  return policy.evaluate(user, resource, context);
}

module.exports = { authorize };
