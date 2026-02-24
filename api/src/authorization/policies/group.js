const Policy = require('./base/policy');
const PolicyContainer = require('./base/policyContainer');
const { isPlatformAdmin } = require('./utils');

class GroupPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'group', requires, evaluate,
    });
  }
}

const isGroupAdmin = new GroupPolicy({
  name: 'isGroupAdmin',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((membership) => membership.group_id === group.id && membership.role === 'ADMIN'),
});

const isGroupMember = new GroupPolicy({
  name: 'isGroupMember',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((membership) => membership.group_id === group.id),
});

const hasGroupOversight = new GroupPolicy({
  name: 'hasGroupOversight',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['id'],
  },
  evaluate: (user, group) => user.oversight_group_ids.includes(group.id),
});

// Create the policy container for Group resource
const groupPolicies = new PolicyContainer({
  resourceType: 'group',
  version: '1.0.0',
  description: 'Policies for Group resource',
});

groupPolicies
  .actions({
    create: isPlatformAdmin,
    create_child: Policy.or([isPlatformAdmin, isGroupAdmin]),

    archive: isPlatformAdmin,
    unarchive: isPlatformAdmin,

    view_metadata: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),
    edit_metadata: Policy.or([isPlatformAdmin, isGroupAdmin]),

    view_members: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),

    add_member: Policy.or([isPlatformAdmin, isGroupAdmin]),
    remove_member: Policy.or([isPlatformAdmin, isGroupAdmin]),

    edit_member_role: Policy.or([isPlatformAdmin, isGroupAdmin]),

  })
  .attributes({
    // * - any action
    '*': [
      {
        policy: Policy.or([isPlatformAdmin, isGroupAdmin]),
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: isGroupMember,
        attribute_filters: ['id', 'name', 'slug', 'description', 'is_archived', 'metadata', 'members'],
      },
      {
        policy: hasGroupOversight,
        attribute_filters: ['*'],
      }],
  })
  .freeze();

module.exports = groupPolicies;
