/**
 * Every attribute a policy declares must be one a hydrator can supply.
 *
 * A requirement no hydrator can meet is a `HydrationError` and a 500, and only on the first
 * request that evaluates that policy without pre-fetching the entity. A platform admin never
 * reaches the policy, and a route that pre-fetches supplies the attribute itself, so the defect
 * stays invisible until an ordinary user hits an ordinary route. Checking at boot moves it to
 * startup, for every policy, every attribute rule, and every transition row.
 *
 * @see docs/contributing/techniques/authorization-engine.md — Requirements no hydrator can supply
 */

function hydratorFor(hydratorRegistry, type) {
  try {
    return hydratorRegistry.get(type);
  } catch (err) {
    return null;
  }
}

/**
 * Every attribute requirement the registry declares: each term of each action policy and each
 * attribute rule, and each transition row.
 * @param {import('./policies/PolicyRegistry')} policyRegistry
 * @returns {{ where: string, entity: string, hydratorType: string, attrs: string[] }[]}
 */
function collectRequirements(policyRegistry) {
  const out = [];
  const add = (where, entity, hydratorType, attrs) => {
    if (attrs?.length) {
      out.push({
        where, entity, hydratorType, attrs,
      });
    }
  };
  const addPolicy = (where, resourceType, policy) => {
    policy.terms().forEach((term) => {
      const termWhere = `${where} (${term.name})`;
      add(termWhere, 'user', 'user', term.requires.user);
      add(termWhere, 'resource', term.resourceType ?? resourceType, term.requires.resource);
      add(termWhere, 'context', 'context', term.requires.context);
    });
  };

  policyRegistry.listTypes().forEach((resourceType) => {
    const container = policyRegistry.get(resourceType);
    container.getActionNames().forEach((action) => {
      const where = `${resourceType}.${action}`;
      addPolicy(where, resourceType, container.getPolicy(action));
    });
    Object.entries(container.export().attributeRules).forEach(([action, rules]) => {
      rules.forEach((rule, index) => {
        addPolicy(`${resourceType}.${action} attribute rule ${index}`, resourceType, rule.policy);
      });
    });
  });
  return out;
}

/**
 * @param {import('./policies/PolicyRegistry')} policyRegistry
 * @param {import('./hydrators/HydratorRegistry').HydratorRegistry} hydratorRegistry
 * @returns {string[]} one line per requirement no hydrator can supply
 */
function findUnhydratableRequirements(policyRegistry, hydratorRegistry) {
  const problems = [];
  collectRequirements(policyRegistry).forEach(({
    where, entity, hydratorType, attrs,
  }) => {
    const hydrator = hydratorFor(hydratorRegistry, hydratorType);
    if (!hydrator) {
      problems.push(`${where}: no hydrator for ${entity} type ${hydratorType}`);
      return;
    }
    if (typeof hydrator.canHydrate !== 'function') return;
    attrs.filter((attr) => !hydrator.canHydrate(attr))
      .forEach((attr) => problems.push(`${where}: ${entity}.${attr} is not hydratable by ${hydratorType}`));
  });
  return [...new Set(problems)];
}

/**
 * Every leaf term whose `evaluate` is an async function.
 *
 * A term decides from the attributes it declares, which the hydrators fetch before `evaluate`
 * runs. An async `evaluate` almost always means the term reads the database itself, so its
 * `requires` understates what it reads and no compiler can turn it into SQL.
 * @see docs/contributing/techniques/authorization-engine.md — Terms read `access_paths`
 * @param {import('./policies/PolicyRegistry')} policyRegistry
 * @returns {string[]} `<resource type>.<action> (<term>)`, one per async term
 */
function findAsyncTerms(policyRegistry) {
  const found = new Set();
  const check = (where, policy) => policy.terms()
    // `_evaluate` is the function the policy author wrote. `evaluate` is Policy's own async
    // wrapper, which every term has.
    .filter((term) => term._evaluate?.constructor?.name === 'AsyncFunction')
    .forEach((term) => found.add(`${where} (${term.name})`));
  policyRegistry.listTypes().forEach((resourceType) => {
    const container = policyRegistry.get(resourceType);
    container.getActionNames().forEach((action) => check(`${resourceType}.${action}`, container.getPolicy(action)));
    Object.entries(container.export().attributeRules).forEach(([action, rules]) => {
      rules.forEach((rule, index) => check(`${resourceType}.${action} attribute rule ${index}`, rule.policy));
    });
  });
  return [...found];
}

/**
 * Throws at startup when the registries break either check above.
 *
 * An unmet requirement would otherwise be a 500 on the first ordinary request that evaluates it.
 * An async term's read belongs in a hydrator virtual attribute.
 *
 * @param {import('./policies/PolicyRegistry')} policyRegistry
 * @param {import('./hydrators/HydratorRegistry').HydratorRegistry} hydratorRegistry
 * @see docs/contributing/techniques/authorization-engine.md — Requirements no hydrator can supply
 */
function assertRegistriesValid(policyRegistry, hydratorRegistry) {
  const unhydratable = findUnhydratableRequirements(policyRegistry, hydratorRegistry);
  if (unhydratable.length) {
    throw new Error(`Policies declare attributes no hydrator supplies:\n  ${unhydratable.join('\n  ')}`);
  }
  const asyncTerms = findAsyncTerms(policyRegistry);
  if (asyncTerms.length) {
    throw new Error(`Policies read the database inside evaluate:\n  ${asyncTerms.join('\n  ')}`);
  }
}

module.exports = {
  collectRequirements, findUnhydratableRequirements, findAsyncTerms, assertRegistriesValid,
};
