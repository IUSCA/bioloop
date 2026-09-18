/**
 * Decision helpers bound to one resource type, resolved when a module loads.
 *
 * A handler that names its type and action as strings on every call learns of a typo only when
 * that handler runs. Binding them at module load checks the type and the action once, at
 * startup, the way `authorize(type, action)` already does for the middleware.
 *
 * ```js
 * const datasetAuth = require('@/authorization').import('dataset');
 * const decideContribute = datasetAuth.action('contribute');   // throws here if unknown
 * const decision = await decideContribute({ identifiers, policyExecutionContext, preFetched });
 * ```
 *
 * The string forms stay for a caller whose type comes from data and for tests.
 */

/**
 * @param {Object} deps
 * @param {import('../core/policies/PolicyRegistry')} deps.policyRegistry
 * @param {import('./paths').PathRegistry} deps.pathRegistry
 * @param {Function} deps.decide - the decision pipeline
 * @param {Object} deps.listHelpers - from `createListHelpers`
 * @returns {(resourceType: string) => Object}
 */
function createImportFor({
  policyRegistry, pathRegistry, decide, listHelpers,
}) {
  return function importFor(resourceType) {
    const container = policyRegistry.get(resourceType);
    const requireAction = (action) => {
      container.getPolicy(action);
      return action;
    };

    return Object.freeze({
      /** `(options) => decision`, for one action. */
      action(name) {
        const action = requireAction(name);
        return (options) => decide(resourceType, action, options);
      },

      /** `(rows, { req, idOf }) => metas`, deciding `name` on each row. */
      rows(name = 'view_metadata') {
        const action = requireAction(name);
        return (rows, { req, idOf }) => listHelpers.decideRows(resourceType, rows, { req, idOf, action });
      },

      /** `(req) => filter`, the filter of the type's `list` decision. */
      listFilter() {
        requireAction('list');
        return (req) => listHelpers.listFilter(req, resourceType);
      },

      /** `(req, ids) => standings`, from the type's registered paths. */
      standingOfRows() {
        pathRegistry.get(resourceType);
        return (req, ids) => listHelpers.standingOfRows(req, resourceType, ids);
      },
    });
  };
}

module.exports = { createImportFor };
