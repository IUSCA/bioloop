const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { platformAdminOnly } = require('./utils/index');

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

const isMemberContributionsAllowed = new GroupPolicy({
  name: 'isMemberContributionsAllowed',
  requires: {
    resource: ['allow_user_contributions'],
  },
  evaluate: (user, group) => group.allow_user_contributions === true,
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

const PUBLIC_ATTRIBUTES = ['id', 'name', 'slug', 'description', 'metadata.type', 'is_archived', '_count.members'];

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
groupPolicies
  .roles([
    { policy: isGroupAdmin, role: CallerRole.ADMIN },
    { policy: hasGroupOversight, role: CallerRole.OVERSIGHT },
    { policy: isGroupMember, role: CallerRole.MEMBER },
    { policy: canAccessResourcesOwnedByGroup, role: CallerRole.RESOURCE_ACCESS },
  ])
  .actions({
    create: platformAdminOnly,
    create_child: isGroupAdmin,

    archive: isGroupAdmin,
    unarchive: platformAdminOnly,

    view_metadata: Policy.or([isGroupMember, hasGroupOversight, canAccessResourcesOwnedByGroup]),
    edit_metadata: isGroupAdmin,
    list: Policy.always, // database query will contains filters based on user's access, so no policy needed here
    view_hierarchy: platformAdminOnly,
    list_invalid: platformAdminOnly,
    view_audit_logs: Policy.or([isGroupAdmin, hasGroupOversight]),

    view_members: Policy.or([isGroupMember, hasGroupOversight]),
    view_ancestors: Policy.or([isGroupMember, hasGroupOversight]),

    // all descendants
    view_descendants: Policy.or([isGroupAdmin, hasGroupOversight]),

    add_member: isGroupAdmin,
    remove_member: isGroupAdmin,
    edit_member_role: isGroupAdmin,

    add_dataset: Policy.or([isGroupAdmin, isMemberContributionsAllowed]),
    add_collection: isGroupAdmin,
  })
  .attributes({
    // * - any action
    '*': [
      {
        policy: isGroupAdmin,
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: hasGroupOversight,
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: isGroupMember,
        attribute_filters:
        PUBLIC_ATTRIBUTES.concat(
          [
            'created_at', 'allow_user_contributions',
            'ancestors[*].id', 'ancestors[*].name', 'ancestors[*].slug', 'ancestors[*].description',
            'ancestors[*].is_archived', 'ancestors[*].depth', 'ancestors[*].metadata',
            'admins[*].id', 'admins[*].name', 'admins[*].email', 'admins[*].username', 'admins[*].subject_id',
          ],
        ),
      },
      {
        policy: canAccessResourcesOwnedByGroup,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
    view_members: [
      {
        policy: Policy.or([isGroupAdmin, hasGroupOversight]),
        attribute_filters: ['*'],
      },
      {
        policy: isGroupMember,
        attribute_filters: ['*', '!assignor', '!assigned_by'],
      },
    ],
    list: [
      {
        policy: Policy.always,
        attribute_filters: PUBLIC_ATTRIBUTES.concat([
          'created_at', 'allow_user_contributions', 'user_role', 'depth', 'path',
        ]),
      },
    ],
  })
  .freeze();

module.exports = { groupPolicies, CallerRole, PUBLIC_ATTRIBUTES };
