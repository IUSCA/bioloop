const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { mutating, reading } = require('../../core/policies/PolicyContainer');
const { platformAdminOnly, archivedState } = require('./utils/index');

class GroupPolicy extends Policy {
  constructor({
    name, requires, evaluate, meta,
  }) {
    super({
      name, resourceType: 'group', requires, evaluate, meta,
    });
  }
}

const isGroupAdmin = new GroupPolicy({
  name: 'isGroupAdmin',
  meta: { pathKind: 'admin' },
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, group, context) => context.access_paths.kinds.has('admin'),
});

const isGroupMember = new GroupPolicy({
  name: 'isGroupMember',
  meta: { pathKind: 'member' },
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, group, context) => context.access_paths.kinds.has('member'),
});

const hasGroupOversight = new GroupPolicy({
  name: 'hasGroupOversight',
  meta: { pathKind: 'oversight' },
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, group, context) => context.access_paths.kinds.has('oversight'),
});

const canAccessResourcesOwnedByGroup = new GroupPolicy({
  name: 'canAccessResourcesOwnedByGroup',
  meta: { pathKind: 'grant' },
  // A grant on a dataset or collection the group owns.
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, group, context) => context.access_paths.kinds.has('grant'),
});

/**
 * The caller is an effective member of the group, and the group accepts contributions.
 *
 * Membership is part of the term. The flag alone admitted any caller, the anonymous principal
 * included, to add a dataset to a group that accepts contributions.
 * @see docs/design/groups/access-model.md — The decision rule
 */
const isGroupContributor = new GroupPolicy({
  name: 'isGroupContributor',
  meta: { pathKind: 'member', rule: 'contributions_allowed' },
  requires: {
    resource: ['allow_user_contributions'],
    context: ['access_paths'],
  },
  evaluate: (user, group, context) => group.allow_user_contributions === true
    && context.access_paths.kinds.has('member'),
});

/**
 * The profile is published to the world.
 *
 * Requires no user attribute at all, which is what lets an unauthenticated caller satisfy
 * it. Every other term on `view_profile` reads a membership the anonymous principal does
 * not have.
 * @see docs/design/groups/implementation/profiles.md — 1. Visibility is a column, not a grant
 */
const isProfilePublic = new GroupPolicy({
  name: 'isProfilePublic',
  meta: { pathKind: 'resource_rule', rule: 'profile_public' },
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
  meta: { pathKind: 'resource_rule', rule: 'profile_signed_in' },
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
 * @see docs/design/groups/implementation/profiles.md — What each audience sees
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
  .actions({
    create: mutating(platformAdminOnly),
    create_child: mutating(isGroupAdmin),

    archive: mutating(isGroupAdmin, archivedState(['ACTIVE'], ['ARCHIVED'])),
    unarchive: mutating(platformAdminOnly, archivedState(['ARCHIVED'], ['ACTIVE'])),

    view_metadata: reading(Policy.or([isGroupMember, hasGroupOversight, canAccessResourcesOwnedByGroup])),

    // The one action an unauthenticated caller can satisfy. It reads the profile and
    // nothing else; view_metadata stays as it was.
    view_profile: reading(Policy.or([
      isGroupAdmin,
      isGroupMember,
      hasGroupOversight,
      canAccessResourcesOwnedByGroup,
      isProfilePublic,
      isProfileVisibleToSignedInUser,
    ])),
    edit_metadata: mutating(isGroupAdmin),
    view_hierarchy: reading(platformAdminOnly),
    list_invalid: reading(platformAdminOnly),
    view_audit_logs: reading(Policy.or([isGroupAdmin, hasGroupOversight])),

    view_members: reading(Policy.or([isGroupMember, hasGroupOversight])),
    view_ancestors: reading(Policy.or([isGroupMember, hasGroupOversight])),

    // all descendants
    view_descendants: reading(Policy.or([isGroupAdmin, hasGroupOversight])),

    add_member: mutating(isGroupAdmin),
    remove_member: mutating(isGroupAdmin),
    edit_member_role: mutating(isGroupAdmin),

    // Issuing and withdrawing an invitation. An invitation is an add_member that has not
    // happened yet and carries the same authority, so this is not a narrower rule than
    // add_member; it is a separate action because it is separately restrictable.
    // @see docs/design/groups/implementation/invitations.md — Authorization
    invite: mutating(isGroupAdmin),
    // Reading the list is split from issuing because the two differ under ARCHIVED: a frozen
    // group takes no new invitations, and the outstanding ones are exactly what an admin
    // needs to see while it is frozen.
    view_invitations: reading(isGroupAdmin),

    add_dataset: mutating(Policy.or([isGroupAdmin, isGroupContributor])),
    add_collection: mutating(isGroupAdmin),
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
    // A caller sees the union of every matching rule. Anyone reaching this point has already
    // been granted view_profile, which is why the last arm needs no condition.
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
  })
  .freeze();

module.exports = {
  groupPolicies,
  PUBLIC_ATTRIBUTES,
  PUBLIC_PROFILE_ATTRIBUTES,
  PROFILE_ATTRIBUTES,
};
