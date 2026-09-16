/**
 * The three tables, as plain rows the reference model can read without importing the engine.
 *
 * Which states admit an action is not among them: that is the resource's own business logic,
 * and the model reads it from `src/state` rather than from a table beside the policies.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * The rows are built from the registry, because the tables are the specification and each
 * container carries its own rows. The reference model never sees a Policy object: it receives
 * only these rows, so what it decides comes from the model's rule applied to declared facts,
 * not from the engine's closures.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Reference model
 */

const path = require('path');

global.__basedir = global.__basedir || path.join(__dirname, '..', '..');
require('module-alias/register');

const {
  buildTermTable, buildActionTable, buildAttributeTable,
} = require('@/authorization/builtin/tables');
const { GRANT_ACCESS_TYPES, GRANT_ACCESS_TYPE_IMPLICATIONS } = require('@/constants');

/**
 * @param {import('@/authorization/core/policies/PolicyRegistry')} registry
 * @returns {{ actions: Object, attributes: Object[], terms: Object[],
 *   accessTypes: string[], implications: string[][] }}
 */
function modelTablesFrom(registry) {
  const actions = {};
  registry.listTypes().forEach((resourceType) => {
    const container = registry.get(resourceType);
    actions[resourceType] = {};
    container.getActionNames().forEach((action) => {
      const policy = container.getPolicy(action);
      actions[resourceType][action] = {
        restriction: container.getRestrictionClass(action),
        operator: policy.operator,
        terms: policy.terms().map((t) => ({ ...(t.meta || {}), name: t.name })),
      };
    });
  });
  return {
    actions,
    attributes: buildAttributeTable(registry),
    terms: buildTermTable(registry),
    actionRows: buildActionTable(registry),
    accessTypes: GRANT_ACCESS_TYPES.map((t) => t.name),
    implications: GRANT_ACCESS_TYPE_IMPLICATIONS.map((pair) => [...pair]),
  };
}

module.exports = { modelTablesFrom };
