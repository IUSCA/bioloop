const { Notation } = require('notation');
const { setIntersection } = require('@/utils');

function invertGrants(grantsObject) {
  // invert grantsObject to be resource-centric instead of role-centric for easier policy function generation
  const RBAC_POLICIES = {};
  Object.entries(grantsObject).forEach(([role, resources]) => {
    Object.entries(resources).forEach(([resource, actions]) => {
      Object.entries(actions).forEach(([action, attributes]) => {
        if (!RBAC_POLICIES[resource]) {
          RBAC_POLICIES[resource] = {};
        }
        if (!RBAC_POLICIES[resource][action]) {
          RBAC_POLICIES[resource][action] = {};
        }
        RBAC_POLICIES[resource][action][role] = {
          scope: action.endsWith(':any') ? 'any' : 'own',
          attribute_filters: attributes,
        };
      });
    });
  });
  return RBAC_POLICIES;
}

function createFilter(attr_filters) {
  return (obj) => Notation.create(obj).filter(attr_filters).value;
}

function buildPolicyFromRoleGrants(roleGrants) {
  // grants is like
  // {
  //   user: {
  //     scope: 'any'|'own',
  //     attribute_filters: [...],
  //   },
  //   ...
  // }
  return (user, resource, ctx = {}) => {
    const isResourceOwner = ctx?.isResourceOwner || false;

    const user_roles = user?.roles || [];
    const grant_roles = Object.keys(roleGrants);
    const matched_roles = [...setIntersection(grant_roles, user_roles)];

    // if multiple roles match, we could combine their attribute filters
    // (e.g. union for 'any' scope, intersection for 'own' scope) instead of
    // just taking the first match. For now we will just take the first match

    // eslint-disable-next-line no-restricted-syntax
    for (const role of matched_roles) {
      const roleGrant = roleGrants[role];
      if (roleGrant.scope === 'any') {
        return {
          granted: true,
          filter: createFilter(roleGrant.attribute_filters),
        };
      }
      if (roleGrant.scope === 'own' && isResourceOwner) {
        return {
          granted: true,
          filter: createFilter(roleGrant.attribute_filters),
        };
      }
    }

    return {
      granted: false,
    };
  };
}

// returns { [resource]: { [action]: (user, resource) => { granted: boolean, filter: function|null } } }
function buildRegistry(grantsObject) {
  const RBAC_POLICIES = invertGrants(grantsObject);

  // for each resource, for each action, build a function that checks access (user, resource, ctx={}) => boolean
  const registry = {};
  Object.entries(RBAC_POLICIES).forEach(([resource, actions]) => {
    Object.entries(actions).forEach(([action, roleGrants]) => {
      if (!registry[resource]) {
        registry[resource] = { actions: {} };
      }
      registry[resource].actions[action] = buildPolicyFromRoleGrants(roleGrants);
    });
  });
  return registry;
}

module.exports = {
  buildRegistry,
};
