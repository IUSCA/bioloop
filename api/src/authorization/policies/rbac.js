const { Notation } = require('notation');
const { setIntersection } = require('../../utils');
const { grantsObject } = require('../../services/accesscontrols');

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

// const RBAC_POLICIES = {
//   user: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*', '!roles'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*',
//           '!roles'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   workflow: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   datasets: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   dataset_name: {
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   instruments: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   projects: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*',
//           '!users'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   project_datasets: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   project_dataset_files: {
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'own',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   statistics: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   metrics: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   about: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   auth: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   notifications: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   fs: {
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   upload: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
//   alerts: {
//     create: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     read: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       user: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     update: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//     delete: {
//       admin: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//       operator: {
//         scope: 'any',
//         attribute_filters: ['*'],
//       },
//     },
//   },
// };

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

    // TODO: if multiple roles match, we could combine their attribute filters
    // (e.g. union for 'any' scope, intersection for 'own' scope) instead of
    // just taking the first match. For now we will just take the first match

    // eslint-disable-next-line no-restricted-syntax
    for (const role of matched_roles) {
      const roleGrant = roleGrants[role];
      if (roleGrant.scope === 'any') {
        return {
          type: 'policy_result',
          granted: true,
          filter: createFilter(roleGrant.attribute_filters),
        };
      }
      if (roleGrant.scope === 'own' && isResourceOwner) {
        return {
          type: 'policy_result',
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

function buildRegistry() {
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

const POLICY_REGISTRY = buildRegistry();

module.exports = POLICY_REGISTRY;
