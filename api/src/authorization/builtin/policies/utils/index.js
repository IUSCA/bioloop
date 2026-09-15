const Policy = require('../../../core/policies/Policy');

/**
 * The single platform-admin check.
 *
 * Action policies must not name this. The engine consults it once per request, before any
 * action policy runs and after the restriction check, and allows every action when it
 * grants. It lives here because the engine takes it by injection rather than importing it.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 */
const isPlatformAdmin = new Policy({
  name: 'isPlatformAdmin',
  resourceType: null,
  meta: { pathKind: 'platform_admin' }, // this policy is not tied to a specific resource type
  requires: {
    user: ['roles'],
  },
  evaluate: (user) => user?.roles?.includes('admin') === true,
});

/**
 * An action no policy grants, reachable only through the platform-admin short-circuit.
 *
 * Says in one word what `Policy.or([isPlatformAdmin])` used to say in a combinator: nobody
 * qualifies on their own. Without it, removing the admin term from such an action would
 * leave an empty `or`, which reads as an oversight rather than as the intent.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 */
const platformAdminOnly = new Policy({
  name: 'platformAdminOnly',
  resourceType: null,
  // Confers no path. The action is reachable only through the platform-admin short-circuit.
  meta: { pathKind: null, rule: 'platform_admin_only' },
  requires: {
    user: [],
  },
  evaluate: () => false,
});

module.exports = {
  isPlatformAdmin,
  platformAdminOnly,
};
