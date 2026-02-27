const { Notation } = require('notation');

/**
 * Evaluates attribute filtering rules with incremental hydration and short-circuit
 * Rules are evaluated in order - first matching policy wins (short-circuit)
 * Only hydrates attributes needed for each rule, reusing cached data from action policy
 *
 * @async
 * @param {Array} rules - Array of rule objects with {policy, attribute_filters}
 * @param {Object} identifiers - The identifiers for hydration
 * @param {string|number} identifiers.user - User identifier
 * @param {string|number} identifiers.resource - Resource identifier
 * @param {string|number} identifiers.context - Context identifier
 * @param {Object} hydrators - Hydrator objects
 * @param {Object} hydrators.user - User hydrator
 * @param {Object} hydrators.resource - Resource hydrator (can be null)
 * @param {Object} hydrators.context - Context hydrator (can be null)
 * @param {Object} caches - Cache Maps from policyExecutionContext
 * @param {Map} caches.user - User cache (already populated from action policy)
 * @param {Map} caches.resource - Resource cache (already populated from action policy)
 * @param {Map} caches.context - Context cache (already populated from action policy)
 * @returns {Promise<string[]>} Array of attribute names/patterns that can be accessed
 *                              Returns empty array if no rules match (deny-all)
 *
 * @example
 * const rules = [
 *   { policy: isGroupMember, attribute_filters: ['id', 'name'] },
 *   { policy: isGroupAdmin, attribute_filters: ['*'] }
 * ];
 * const filters = await evaluateAttributeFilters(
 *   rules, identifiers, hydrators, caches
 * );
 * // If user is member but not admin: returns ['id', 'name']
 * // If user is admin: returns ['*']
 * // If user is neither: returns []
 */
async function evaluateAttributeFilters(rules, identifiers, hydrators, caches) {
  if (!rules || !Array.isArray(rules)) {
    throw new Error('Rules must be an array');
  }

  if (rules.length === 0) {
    return [];
  }

  // Evaluate each rule in order, hydrating only what's needed for that specific rule
  // eslint-disable-next-line no-restricted-syntax
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      throw new Error('Each rule must be an object');
    }

    if (!rule.policy) {
      throw new Error('Each rule must have a policy');
    }

    if (!Array.isArray(rule.attribute_filters)) {
      throw new Error('Each rule must have attribute_filters as an array');
    }

    // eslint-disable-next-line no-await-in-loop
    const [user, resource, context] = await Promise.all([
      hydrators.user.hydrate({
        id: identifiers.user,
        attributes: rule.policy.requires.user,
        cache: caches.user,
      }),

      hydrators.resource ? hydrators.resource.hydrate({
        id: identifiers.resource,
        attributes: rule.policy.requires.resource,
        cache: caches.resource,
      }) : {},

      hydrators.context && identifiers.context ? hydrators.context.hydrate({
        id: identifiers.context,
        attributes: rule.policy.requires.context,
        cache: caches.context,
      }) : {},
    ]);

    // Evaluate the policy - if it passes, return this rule's filters (short-circuit)
    // eslint-disable-next-line no-await-in-loop
    const matches = await rule.policy.evaluate(user, resource, context);
    if (matches) {
      return rule.attribute_filters;
    }
  }

  // No rules matched - deny all attributes
  return [];
}

/**
 * Creates a filter function that uses Notation library to filter object attributes
 * Supports wildcard '*' for all attributes and exclusion syntax '!fieldName'
 *
 * @param {string[]} attributeFilters - Array of attribute patterns
 *                                       '*' = all attributes
 *                                       'field' = include field
 *                                       '!field' = exclude field (when used with '*')
 *                                       Supports dot notation for nested paths
 * @returns {Function} Filter function that takes an object and returns filtered object
 *
 * @example
 * // Include specific fields
 * const filter = createFilterFunction(['id', 'name', 'email']);
 * filter({ id: 1, name: 'John', email: 'j@ex.com', password: 'secret' });
 * // Returns: { id: 1, name: 'John', email: 'j@ex.com' }
 *
 * @example
 * // All fields except exclusions
 * const filter = createFilterFunction(['*', '!password', '!ssn']);
 * filter({ id: 1, name: 'John', password: 'secret', ssn: '123' });
 * // Returns: { id: 1, name: 'John' }
 *
 * @example
 * // Empty filters (no access)
 * const filter = createFilterFunction([]);
 * filter({ id: 1, name: 'John' });
 * // Returns: {}
 */
function createFilterFunction(attributeFilters) {
  if (!Array.isArray(attributeFilters)) {
    throw new Error('Attribute filters must be an array');
  }

  // If empty array, return function that returns empty object (deny all)
  if (attributeFilters.length === 0) {
    return () => ({});
  }

  // Return a function that filters the given object using Notation
  // return (obj) => {
  //   if (!obj || typeof obj !== 'object') {
  //     return obj;
  //   }

  //   try {
  //     return Notation.create(obj).filter(attributeFilters).value;
  //   } catch (error) {
  //     console.error('Error filtering attributes with Notation:', {
  //       attributeFilters,
  //       error: error.message,
  //     });
  //     // On error, return empty object (fail closed)
  //     return {};
  //   }
  // };
  return (obj) => Notation.create(obj).filter(attributeFilters).value;
}

module.exports = {
  evaluateAttributeFilters,
  createFilterFunction,
};
