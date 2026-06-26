/**
 * Shared hydration utilities for authorization policy evaluation.
 *
 * Eliminates the repeated "resolve hydrators + parallel hydrate" pattern that
 * appears across authorize.js, capabilities.js, and attributeFilters.js.
 */

/**
 * Resolves user, resource, and context hydrators from a registry for a given policy.
 *
 * @param {import('./hydrators/HydratorRegistry').HydratorRegistry} registry
 * @param {import('./policies/Policy')} policy
 * @returns {{ user: Object, resource: Object|null, context: Object }}
 */
function resolveHydrators(registry, policy) {
  return {
    user: registry.get('user'),
    resource: policy.resourceType != null ? registry.get(policy.resourceType) : null,
    context: registry.get('context'),
  };
}

/**
 * Hydrates user, resource, and context entities for a given policy in a single
 * parallel pass, reusing provided caches.
 *
 * @param {Object} options
 * @param {import('./policies/Policy')} options.policy
 *   Policy whose `requires` and `resourceType` drive hydration.
 * @param {Object} options.identifiers
 *   Hydration identifiers ({ user, resource }).
 * @param {{ user: Object, resource: Object|null, context: Object }} options.hydrators
 *   Pre-resolved hydrators — obtain via {@link resolveHydrators}.
 * @param {{ user: Map, resource: Map, context: Map }} options.caches
 *   Shared cache Maps (populated in-place; pass request-scoped Maps for cross-call reuse).
 * @param {Object} [options.preFetched=null]
 *   Optional pre-fetched data seeds ({ user, resource, context }).
 * @param {Object} [options.contextId=null]
 *   Optional explicit context id.  Defaults to
 *   `{ ...identifiers, resourceType: policy.resourceType }`.
 * @returns {Promise<[Object, Object, Object]>} Resolved [user, resource, context] objects.
 */
async function hydrateEntities({
  policy,
  identifiers,
  hydrators,
  caches,
  preFetched = null,
  contextId = null,
}) {
  const resolvedContextId = contextId ?? { ...identifiers, resourceType: policy.resourceType };

  return Promise.all([
    hydrators.user.hydrate({
      id: identifiers.user,
      attributes: policy.requires.user,
      cache: caches.user,
      preFetched: preFetched?.user,
    }),

    hydrators.resource ? hydrators.resource.hydrate({
      id: identifiers.resource,
      attributes: policy.requires.resource,
      cache: caches.resource,
      preFetched: preFetched?.resource,
    }) : {},

    hydrators.context.hydrate({
      id: resolvedContextId,
      attributes: policy.requires.context,
      cache: caches.context,
      preFetched: preFetched?.context,
    }),
  ]);
}

module.exports = { resolveHydrators, hydrateEntities };
