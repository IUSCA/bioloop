/**
 * The access model's tables, built from the policy registry.
 *
 * The tables are not a second copy of the policies. Each container declares, beside every
 * policy, the facts the model needs: a path kind on each term and a restriction class on each
 * action. These builders read those declarations and lay them out as rows, so a container a
 * derived app registers contributes its own rows and nothing in `builtin/` is edited.
 *
 * Which states admit an action is not here. That is the resource's own business logic, and
 * `src/state/builtin/<resource>.js` states it.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * A wrong row is not something the verification harness can catch, because the reference
 * model reads these same tables. The tables are the specification, checked by review and by
 * the generated decision table.
 *
 * @see docs/design/groups/access-model.md
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Where the tables live, and how they change
 */

/**
 * One row per distinct leaf term, per container.
 * @param {import('../../core/policies/PolicyRegistry')} registry
 * @returns {Array<{resource_type: string, term: string, path_kind: string|null,
 *   access_type: string|null, rule: string|null, of: string|null,
 *   requires: {user: string[], resource: string[], context: string[]}}>}
 */
function buildTermTable(registry) {
  const rows = [];
  registry.listTypes().forEach((resourceType) => {
    const container = registry.get(resourceType);
    const seen = new Set();
    const addTerms = (policy) => policy.terms().forEach((term) => {
      const key = `${term.name}|${term.meta?.accessType ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        resource_type: resourceType,
        term: term.name,
        path_kind: term.meta?.pathKind ?? null,
        access_type: term.meta?.accessType ?? null,
        rule: term.meta?.rule ?? null,
        of: term.meta?.of ?? null,
        requires: term.requires,
      });
    });
    container.getActionNames().forEach((action) => addTerms(container.getPolicy(action)));
    Object.values(container.export().attributeRules).flat()
      .forEach((rule) => addTerms(rule.policy));
  });
  return rows;
}

/**
 * One row per registered action.
 * @param {import('../../core/policies/PolicyRegistry')} registry
 * @returns {Array<{resource_type: string, action: string, restriction: string|null,
 *   path_kinds: string[], access_types: string[], rules: string[], operator: string|null}>}
 */
function buildActionTable(registry) {
  const rows = [];
  registry.listTypes().forEach((resourceType) => {
    const container = registry.get(resourceType);
    container.getActionNames().forEach((action) => {
      const policy = container.getPolicy(action);
      const terms = policy.terms();
      rows.push({
        resource_type: resourceType,
        action,
        restriction: container.getRestrictionClass(action),
        path_kinds: [...new Set(terms.map((t) => t.meta?.pathKind).filter(Boolean))],
        access_types: [...new Set(terms.map((t) => t.meta?.accessType).filter(Boolean))],
        rules: [...new Set(terms.map((t) => t.meta?.rule).filter(Boolean))],
        operator: policy.operator,
      });
    });
  });
  return rows;
}

/**
 * One row per attribute rule, in the order the container lists them.
 * @param {import('../../core/policies/PolicyRegistry')} registry
 * @returns {Array<{resource_type: string, action: string, index: number, path_kinds: string[],
 *   access_types: string[], rules: string[], filters: string[]}>}
 */
function buildAttributeTable(registry) {
  const rows = [];
  registry.listTypes().forEach((resourceType) => {
    const { attributeRules } = registry.get(resourceType).export();
    Object.entries(attributeRules).forEach(([action, rules]) => {
      rules.forEach((rule, index) => {
        const terms = rule.policy.terms();
        rows.push({
          resource_type: resourceType,
          action,
          index,
          path_kinds: [...new Set(terms.map((t) => t.meta?.pathKind).filter(Boolean))],
          access_types: [...new Set(terms.map((t) => t.meta?.accessType).filter(Boolean))],
          rules: [...new Set(terms.map((t) => t.meta?.rule).filter(Boolean))],
          filters: [...rule.attribute_filters],
        });
      });
    });
  });
  return rows;
}

module.exports = {
  buildTermTable,
  buildActionTable,
  buildAttributeTable,
};
