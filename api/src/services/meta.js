const { availableActionsOf } = require('@/state');
const { toCapabilitiesArray } = require('@/authorization');

/**
 * A detail route's `_meta`: what the caller may do, and what the resource's state admits.
 *
 * The two answers come from separate layers. Authorization gives `standing` and `capabilities`,
 * and the state rules give `available_actions`, so this lives outside both layers.
 *
 * @param {string} resourceType
 * @param {Object} row - fetched with the type's `withStateFields`
 * @param {Object} permission - derived with capabilities and standing, from the middleware or
 *   `authorizeAction`
 * @param {Object} [options]
 * @param {string[]} [options.extraCapabilities] - capabilities the route decides itself, such as
 *   `request_access`
 * @returns {{standing: Object[], capabilities: string[], available_actions: string[]}}
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */
function buildMeta(resourceType, row, permission, { extraCapabilities = [] } = {}) {
  return {
    standing: permission.standing,
    capabilities: toCapabilitiesArray(permission.capabilities).concat(extraCapabilities),
    available_actions: availableActionsOf(resourceType, row),
  };
}

module.exports = { buildMeta };
