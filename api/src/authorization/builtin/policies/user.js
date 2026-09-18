const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { reading } = require('../../core/policies/PolicyContainer');

class UserPolicy extends Policy {
  constructor({
    name, requires, evaluate, meta,
  }) {
    super({
      name, resourceType: 'user', requires, evaluate, meta,
    });
  }
}

const isAdminOfAnyGroup = new UserPolicy({
  name: 'isAdminOfAnyGroup',
  meta: { pathKind: 'admin', of: 'any_group' },
  requires: {
    user: ['group_memberships'],
  },
  evaluate: (user) => user.group_memberships.some(
    (membership) => membership.role === GROUP_MEMBER_ROLE.ADMIN,
  ),
});

const userPolicies = new PolicyContainer({
  resourceType: 'user',
  version: '1.0.0',
  description: 'Policies for User resource',
});

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
userPolicies.actions({
  list: reading(isAdminOfAnyGroup),
})
  .attributes({
    '*': [
      {
        policy: Policy.always,
        attribute_filters: ['*'],
      },
    ],
  })
  .freeze();

module.exports = {
  userPolicies,
};
