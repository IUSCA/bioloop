const { HydratorRegistry } = require('./hydrators/HydratorRegistry');
const Policy = require('./policies/Policy');
const PolicyContainer = require('./policies/PolicyContainer');

class CapabilityEvaluationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CapabilityEvaluationError';
  }
}

/**
 * Evaluates a set of action policies for a given user+resource in a single hydration pass.
 *
 * Algorithm:
 *   1. Resolve each requested action to its Policy from the container.
 *   2. Build a union policy via Policy.or() — merges all `requires` across requested actions,
 *      so the single authorize() call below hydrates every attribute needed by every action.
 *   3. Call authorize() once with the union policy.  This populates policyExecutionContext.cache
 *      with all user / resource / context attributes required by any of the requested actions.
 *   4. Call authorize() per individual action.  Because policyExecutionContext.cache is now fully
 *      populated, PrismaHydrator.hydrate() finds every attribute already cached and fires no DB
 *      queries.  The per-action calls are pure in-memory policy evaluations.
 *
 * Performance contract:
 *   - DB I/O equivalent to a single authorize() call (one hydration pass).
 *   - N additional `authorize()` invocations after the union pass cost zero DB round-trips due to
 *     the shared policyExecutionContext cache.
 *   - Grant-based policies that rely on preFetched.context (e.g. datasetGrantTypes Set) are
 *     evaluated purely in memory once the context is seeded via preFetched.context — no per-action
 *     DB hits, provided the caller supplies the precomputed context values.
 *
 * @async
 * @param {Object} options
 * @param {PolicyContainer} options.policyContainer         - Container that owns the action policies.
 * @param {string[]}         options.actionNames            - Actions to evaluate (must be registered in container).
 * @param {Object}           options.identifiers            - Hydration identifiers.
 * @param {string|number}    options.identifiers.user       - User id.
 * @param {string|number}    [options.identifiers.resource] - Resource id (omit for user-only policies).
 * @param {HydratorRegistry} options.hydratorRegistry               - Hydrator registry.
 * @param {Object}           [options.policyExecutionContext] - Shared request-scoped execution context
 *                                                             (req.policyContext).  When provided the
 *                                                             cache Maps persist across the entire HTTP
 *                                                             request, so attributes already hydrated by
 *                                                             a preceding authorize() middleware call are
 *                                                             reused here at zero cost.
 * @param {Object}           [options.preFetched]           - Pre-fetched data passed through to hydrators.
 * @param {Object}           [options.preFetched.user]      - Pre-fetched user fields (seeds user cache).
 * @param {Object}           [options.preFetched.resource]  - Pre-fetched resource fields (seeds resource cache).
 * @param {Object}           [options.preFetched.context]   - Pre-fetched context values (e.g. grant Sets).
 *                                                            ContextHydrator seeds from this object, making
 *                                                            grant-based policies pure in-memory lookups.
 * @returns {Promise<Object.<string, boolean>>} Map of actionName → boolean capability result.
 */
async function evaluateCapabilitySet({
  policyContainer,
  actionNames,
  identifiers,
  hydratorRegistry,
  policyExecutionContext = null,
  preFetched = null,
}) {
  // --- Input validation ---

  if (!policyContainer || !(policyContainer instanceof PolicyContainer)) {
    throw new CapabilityEvaluationError('policyContainer must be an instance of PolicyContainer');
  }
  if (!Array.isArray(actionNames) || actionNames.length === 0) {
    throw new CapabilityEvaluationError('actionNames must be a non-empty array of strings');
  }
  if (!identifiers || typeof identifiers !== 'object') {
    throw new CapabilityEvaluationError('identifiers must be an object');
  }
  if (identifiers.user == null) {
    throw new CapabilityEvaluationError('identifiers.user is required');
  }
  if (!hydratorRegistry || !(hydratorRegistry instanceof HydratorRegistry)) {
    throw new CapabilityEvaluationError('hydratorRegistry must be an instance of HydratorRegistry');
  }

  // --- Step 1: Resolve action policies ---

  const policies = actionNames.map((name) => {
    const policy = policyContainer.getPolicy(name);
    return { name, policy };
  });

  // --- Step 2: Build union policy to get merged `requires` ---
  //
  // Policy.or() unions the `requires` arrays of all child policies (deduped).
  // hydrate the full closure of attributes needed by any action in one pass.

  const unionPolicy = Policy.or(policies.map((p) => p.policy));

  // --- Step 3: Single hydration pass ---
  //
  // Populates policyExecutionContext.cache.{user,resource,context} with every attribute
  // declared across all requested action policies.  The union result itself is discarded —
  // we only care about the side-effect of cache population.

  const userHydrator = hydratorRegistry.get('user');
  const contextHydrator = hydratorRegistry.get('context');

  let resourceHydrator = null;
  if (unionPolicy.resourceType != null) {
    resourceHydrator = hydratorRegistry.get(unionPolicy.resourceType);
  }

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: unionPolicy.requires.user,
      cache: policyExecutionContext?.cache?.user || new Map(),
      preFetched: preFetched?.user,
    }),

    resourceHydrator ? resourceHydrator.hydrate({
      id: identifiers.resource,
      attributes: unionPolicy.requires.resource,
      cache: policyExecutionContext?.cache?.resource || new Map(),
      preFetched: preFetched?.resource,
    }) : {},

    contextHydrator.hydrate({
      id: { ...identifiers, resourceType: unionPolicy.resourceType },
      attributes: unionPolicy.requires.context,
      cache: policyExecutionContext?.cache?.context || new Map(),
      preFetched: preFetched?.context,
    }),
  ]);

  // --- Step 4: Per-action in-memory evaluation ---
  //
  // Every evaluation is pure in-memory.

  const results = {};

  await Promise.all(
    policies.map(async ({ name, policy }) => {
      results[name] = policy.evaluate(user, resource, context);
    }),
  );

  return results;
}

module.exports = { evaluateCapabilitySet, CapabilityEvaluationError };
