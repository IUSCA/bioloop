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

/**
 * The profile is published to the world.
 *
 * Requires no user attribute at all, which is what lets an unauthenticated caller satisfy
 * it. Every other term on `view_profile` reads a membership the anonymous principal does
 * not have.
 * @see docs/design/groups/profiles.md — 1. Visibility is a column, not a grant
 */
const isProfilePublic = new GroupPolicy({
  name: 'isProfilePublic',
  requires: {
    resource: ['profile_visibility'],
  },
  evaluate: (user, group) => group.profile_visibility === 'PUBLIC',
});

/**
 * The profile is published to signed-in users, and the caller is one.
 *
 * PUBLIC is the wider setting, so it satisfies this term too. The `is_anonymous` check is
 * what keeps AUTHENTICATED from admitting an unauthenticated caller.
 */
const isProfileVisibleToSignedInUser = new GroupPolicy({
  name: 'isProfileVisibleToSignedInUser',
  requires: {
    user: ['is_anonymous'],
    resource: ['profile_visibility'],
  },
  evaluate: (user, group) => user.is_anonymous !== true
    && ['PUBLIC', 'AUTHENTICATED'].includes(group.profile_visibility),
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

const PUBLIC_ATTRIBUTES = [
  'id', 'name', 'slug', 'description', 'metadata.type', 'is_archived', '_count.members',
  // A tagline sits at the same sensitivity as the description already here: one line an
  // admin wrote about the group. avatar_key is an object-store key; the route that serves
  // the bytes authorizes on its own.
  'tagline', 'avatar_key',
];

/**
 * What a caller sees who has no relationship to this group beyond being allowed to read
 * its profile. An unauthenticated caller sees exactly this and nothing else.
 *
 * Three absences are rules rather than oversights. No `_count`, because a member count
 * describes people who did not choose to be counted in public. No `admins[*].email`,
 * because a group publishes a shared inbox as a link when it wants to be reachable and an
 * address list is worth harvesting. No `ancestors[*]`, because the hierarchy is internal
 * structure.
 * @see docs/design/groups/profiles.md — What each audience sees
 */
const PUBLIC_PROFILE_ATTRIBUTES = [
  'id', 'name', 'slug', 'description', 'tagline', 'about_md', 'avatar_key',
  'metadata.type', 'metadata.links', 'metadata.citation', 'metadata.publications',
  'is_archived', 'profile_visibility',
];

/** The profile columns a member sees on top of everything they already saw. */
const PROFILE_ATTRIBUTES = [
  'tagline', 'about_md', 'avatar_key', 'profile_visibility',
  'metadata.links', 'metadata.citation', 'metadata.publications',
];

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

    // The one action an unauthenticated caller can satisfy. It reads the profile and
    // nothing else; view_metadata stays as it was.
    view_profile: Policy.or([
      isGroupAdmin,
      isGroupMember,
      hasGroupOversight,
      canAccessResourcesOwnedByGroup,
      isProfilePublic,
      isProfileVisibleToSignedInUser,
    ]),
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

    // Issuing and withdrawing an invitation. An invitation is an add_member that has not
    // happened yet and carries the same authority, so this is not a narrower rule than
    // add_member; it is a separate action because it is separately restrictable.
    // @see docs/design/groups/invitations.md — Authorization
    invite: isGroupAdmin,
    // Reading the list is split from issuing because the two differ under ARCHIVED: a frozen
    // group takes no new invitations, and the outstanding ones are exactly what an admin
    // needs to see while it is frozen.
    view_invitations: isGroupAdmin,

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
        PUBLIC_ATTRIBUTES.concat(PROFILE_ATTRIBUTES).concat(
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
    // Rules short-circuit on the first matching policy rather than combining, so these run
    // most-privileged first and the catch-all sits last. Anyone reaching this point has
    // already been granted view_profile, which is why the last arm needs no condition.
    view_profile: [
      {
        policy: Policy.or([isGroupAdmin, hasGroupOversight]),
        attribute_filters: ['*'],
      },
      {
        policy: isGroupMember,
        attribute_filters: PUBLIC_ATTRIBUTES.concat(PROFILE_ATTRIBUTES).concat([
          'created_at', 'allow_user_contributions',
          'admins[*].id', 'admins[*].name', 'admins[*].email', 'admins[*].username',
          'ancestors[*].id', 'ancestors[*].name', 'ancestors[*].slug',
        ]),
      },
      {
        policy: Policy.always,
        attribute_filters: PUBLIC_PROFILE_ATTRIBUTES.concat(['admins[*].id', 'admins[*].name']),
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

module.exports = {
  groupPolicies,
  CallerRole,
  PUBLIC_ATTRIBUTES,
  PUBLIC_PROFILE_ATTRIBUTES,
  PROFILE_ATTRIBUTES,
};
