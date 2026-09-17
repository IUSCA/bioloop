const { projectObject } = require('@/utils/expression');
const { hydrateEntities } = require('./hydrationUtils');

/**
 * The field lists of every attribute rule whose policy matches the caller.
 *
 * Rules do not short-circuit. A caller who holds several paths sees the union of what each path
 * shows, so the order rules are declared in no longer decides what anyone sees. Each rule
 * hydrates only what its policy needs, reusing what the action policy already hydrated.
 *
 * @async
 * @param {Array} rules - Array of rule objects with {policy, attribute_filters}
 * @param {Object} identifiers - The identifiers for hydration ({ user, resource })
 * @param {Object} hydrators - `{ user, resource, context }` hydrators
 * @param {Object} caches - `{ user, resource, context }` cache Maps from the policy context
 * @param {Object} [contextId] - the context identifiers the action policy hydrated under
 * @returns {Promise<string[][]>} one filter list per matching rule; empty when none matches
 * @see docs/design/groups/access-model.md — Projection
 */
async function evaluateAttributeFilters(rules, identifiers, hydrators, caches, contextId = null) {
  // `PolicyContainer.attributes()` checked every rule's shape when it was registered.
  const matched = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const rule of rules) {
    // eslint-disable-next-line no-await-in-loop
    const [user, resource, context] = await hydrateEntities({
      policy: rule.policy,
      identifiers,
      hydrators,
      caches,
      contextId,
    });

    // eslint-disable-next-line no-await-in-loop
    if (await rule.policy.evaluate(user, resource, context)) matched.push(rule.attribute_filters);
  }

  return matched;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Merges two projections of the same source into the union of their keys.
 *
 * Both come from one row, so where both hold a value it is the same value, and the merge only
 * has to decide which keys survive: a key survives when either projection kept it.
 */
function mergeProjections(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      if (!(i in a)) return b[i];
      if (!(i in b)) return a[i];
      return mergeProjections(a[i], b[i]);
    });
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    Object.keys(b).forEach((key) => {
      out[key] = key in a ? mergeProjections(a[key], b[key]) : b[key];
    });
    return out;
  }
  return a;
}

/**
 * The filter a granted caller's response goes through: the union of the projections of every
 * matching rule. A negation in one rule removes a key only when no other matching rule keeps it.
 *
 * @param {string[][]} filterLists - one list per matching rule, from `evaluateAttributeFilters`
 * @returns {Function} `(obj) => projected obj`; returns `{}` when no rule matched (deny all)
 * @see docs/design/groups/access-model.md — Projection
 */
function createFilterFunction(filterLists) {
  if (filterLists.length === 0) {
    return () => ({});
  }

  return (obj) => filterLists
    .map((filters) => projectObject(obj, filters))
    .reduce((merged, projection) => mergeProjections(merged, projection));
}

module.exports = {
  evaluateAttributeFilters,
  createFilterFunction,
  mergeProjections,
};
