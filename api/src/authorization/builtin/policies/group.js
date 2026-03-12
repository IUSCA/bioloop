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

const canAccessResourcesOwnedByGroup = new GroupPolicy({
  name: 'canAccessResourcesOwnedByGroup',
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

const CallerRole = Object.freeze({
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  OVERSIGHT: 'OVERSIGHT',
  RESOURCE_ACCESS: 'RESOURCE_ACCESS',
});

groupPolicies
  .roles([
    { policy: isPlatformAdmin, role: CallerRole.PLATFORM_ADMIN },
    { policy: isGroupAdmin, role: CallerRole.ADMIN },
    { policy: hasGroupOversight, role: CallerRole.OVERSIGHT },
    { policy: isGroupMember, role: CallerRole.MEMBER },
    { policy: canAccessResourcesOwnedByGroup, role: CallerRole.RESOURCE_ACCESS },
  ])
  .actions({
    create: isPlatformAdmin,
    create_child: Policy.or([isPlatformAdmin, isGroupAdmin]),

    archive: isPlatformAdmin,
    unarchive: isPlatformAdmin,

    view_metadata: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight, canAccessResourcesOwnedByGroup]),
    edit_metadata: Policy.or([isPlatformAdmin, isGroupAdmin]),
    list: Policy.always, // database query will contains filters based on user's access, so no policy needed here

    view_members: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),
    view_ancestors: Policy.or([isPlatformAdmin, isGroupMember, hasGroupOversight]),

    // all descendants
    view_descendants: Policy.or([isPlatformAdmin, isGroupAdmin, hasGroupOversight]),

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
          'ancestors[*].id', 'ancestors[*].name', 'ancestors[*].slug', 'ancestors[*].description',
          'ancestors[*].is_archived', 'ancestors[*].depth', 'ancestors[*].metadata',
          'admins[*].id', 'admins[*].name', 'admins[*].email', 'admins[*].username', 'admins[*].subject_id',
        ],
      },
      {
        policy: canAccessResourcesOwnedByGroup,
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
        attribute_filters: ['*', '!assignor', '!assigned_by'],
      },
    ],
    list: [
      {
        policy: isPlatformAdmin,
        attribute_filters: ['*'],
      },
      {
        policy: Policy.always,
        attribute_filters: [
          'id', 'name', 'slug', 'description', 'is_archived', 'metadata', 'created_at',
          'allow_user_contributions', 'size', 'user_role',
        ],
      },
    ],
  })
  .freeze();

module.exports = { groupPolicies, CallerRole };
