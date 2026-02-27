const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');

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
    user: ['effective_group_ids'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .effective_group_ids
    .includes(group.id),
});

const hasGroupOversight = new GroupPolicy({
  name: 'hasGroupOversight',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['id'],
  },
  evaluate: (user, group) => user.oversight_group_ids.includes(group.id),
});

const canAccessOwnedResources = new GroupPolicy({
  name: 'canAccessOwnedResources',
  requires: {
    user: ['accessible_owner_group_ids'], // ids of groups that own resources U has grants on
    resource: ['id'],
  },
  evaluate: (user, group) => user.accessible_owner_group_ids.includes(group.id),
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

    view_metadata: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight, canAccessOwnedResources]),
    edit_metadata: Policy.or([isPlatformAdmin, isGroupAdmin]),

    view_members: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),
    view_ancestors: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),

    // immediate children of the group (not all descendants, which would be covered by view_metadata)
    view_children: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),

    add_member: Policy.or([isPlatformAdmin, isGroupAdmin]),
    remove_member: Policy.or([isPlatformAdmin, isGroupAdmin]),
    edit_member_role: Policy.or([isPlatformAdmin, isGroupAdmin]),

    // view collections and datasets owned by the group
    view_resources: Policy.or([isPlatformAdmin, isGroupAdmin, hasGroupOversight]),
  })
  .attributes({
    // * - any action
    '*': [
      {
        policy: Policy.or([isPlatformAdmin, isGroupAdmin, hasGroupOversight]),
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: isGroupMember,
        attribute_filters: [
          'id', 'name', 'slug', 'description', 'is_archived', 'metadata', 'created_at', 'allow_user_contributions',
        ],
      },
      {
        policy: canAccessOwnedResources,
        attribute_filters: ['id', 'name', 'slug', 'description', 'is_archived'],
      },
    ],
    view_members: [
      {
        policy: Policy.or([isPlatformAdmin, isGroupAdmin, hasGroupOversight]),
        attribute_filters: ['*'],
      },
      {
        policy: isGroupMember,
        attribute_filters: ['!assigned_by'],
      },
    ],
  })
  .freeze();

module.exports = { groupPolicies };
