const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');

class UserPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'user', requires, evaluate,
    });
  }
}

const isAdminOfAnyGroup = new UserPolicy({
  name: 'isAdminOfAnyGroup',
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

userPolicies.actions({
  list: Policy.or([isPlatformAdmin, isAdminOfAnyGroup]),
})
  .attributes({
    '*': [
      {
        policy: Policy.always,
        attribute_filters: ['*'],
      },
    ],
  });

module.exports = {
  userPolicies,
};
