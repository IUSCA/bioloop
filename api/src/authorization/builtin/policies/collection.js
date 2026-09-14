const { GRANT_ACCESS_TYPES } = require('@/constants');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { platformAdminOnly } = require('./utils/index');
const { PUBLIC_ATTRIBUTES: GROUP_PUBLIC_ATTRIBUTES } = require('./group');

const VALID_GRANT_NAMES = new Set(GRANT_ACCESS_TYPES.map((g) => g.name));

class CollectionPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'collection', requires, evaluate,
    });
  }
}

const isCollectionAdmin = new CollectionPolicy({
  name: 'isCollectionAdmin',
  requires: {
    user: ['group_memberships'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, collection) => user
    .group_memberships
    .some((membership) => membership.group_id === collection.owner_group_id && membership.role === 'ADMIN'),
});

const userHasGrant = (access_type) => {
  if (!VALID_GRANT_NAMES.has(access_type)) {
    throw new Error(`Unknown grant access type: '${access_type}'`);
  }
  return new CollectionPolicy({
    name: 'userHasGrant',
    requires: {
      user: [],
      resource: [],
      context: ['active_grant_access_types'],
    },
    evaluate: (user, dataset, context) => context.active_grant_access_types.has(access_type),
  });
};

const hasCollectionOversight = new CollectionPolicy({
  name: 'hasCollectionOversight',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, collection) => user.oversight_group_ids.includes(collection.owner_group_id),
});

/**
 * The profile is published to the world. Requires no user attribute, which is what lets an
 * unauthenticated caller satisfy it.
 * @see docs/design/groups/profiles.md — 1. Visibility is a column, not a grant
 */
const isProfilePublic = new CollectionPolicy({
  name: 'isProfilePublic',
  requires: {
    resource: ['profile_visibility'],
  },
  evaluate: (user, collection) => collection.profile_visibility === 'PUBLIC',
});

/** The profile is published to signed-in users, and the caller is one. */
const isProfileVisibleToSignedInUser = new CollectionPolicy({
  name: 'isProfileVisibleToSignedInUser',
  requires: {
    user: ['is_anonymous'],
    resource: ['profile_visibility'],
  },
  evaluate: (user, collection) => user.is_anonymous !== true
    && ['PUBLIC', 'AUTHENTICATED'].includes(collection.profile_visibility),
});

const CallerRole = Object.freeze({
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  OVERSIGHT: 'OVERSIGHT',
  GRANT_HOLDER: 'GRANT_HOLDER',
});

const collectionPolicies = new PolicyContainer({
  resourceType: 'collection',
  version: '1.0.0',
  description: 'Policies for Collection resource',
});

const PUBLIC_ATTRIBUTES = [
  'id', 'name', 'slug', 'description', 'metadata', 'created_at', 'updated_at', 'is_archived', '_count.datasets',
  'tagline',
].concat(GROUP_PUBLIC_ATTRIBUTES.map((attr) => `owner_group.${attr}`)); // include owner group attributes with 'owner_group.' prefix

/**
 * What a caller sees who may read the profile and has no grant on the collection. An
 * unauthenticated caller sees exactly this.
 *
 * `_count.datasets` is absent on purpose. Telling a signed-in viewer how many datasets
 * they cannot open is what makes a request worth making, and they are identified when they
 * ask. Telling an anonymous viewer the same thing discloses the size of a holding to
 * somebody the system cannot name.
 *
 * The owning group is named because a citation is not usable without it.
 * @see docs/design/groups/profiles.md — What each audience sees
 */
const PUBLIC_PROFILE_ATTRIBUTES = [
  'id', 'name', 'slug', 'description', 'tagline', 'about_md',
  'metadata.links', 'metadata.citation', 'metadata.publications', 'metadata.fields',
  'created_at', 'is_archived', 'profile_visibility',
  'owner_group.id', 'owner_group.name', 'owner_group.slug',
];

/** The profile columns a grant holder sees on top of everything they already saw. */
const PROFILE_ATTRIBUTES = ['tagline', 'about_md', 'profile_visibility'];

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
collectionPolicies
  .actions({
  // here isCollectionAdmin means the user is admin of the group that will be the owner of the collection
    create: isCollectionAdmin,

    view_metadata: Policy.or([
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('COLLECTION:VIEW_METADATA'),
    ]),

    // The one action an unauthenticated caller can satisfy. view_metadata stays as it was.
    view_profile: Policy.or([
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('COLLECTION:VIEW_METADATA'),
      isProfilePublic,
      isProfileVisibleToSignedInUser,
    ]),

    list: Policy.always, // anyone can list collections, but the results will be filtered based on their permissions
    list_datasets: Policy.or([
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('COLLECTION:LIST_CONTENTS')]),

    edit_metadata: isCollectionAdmin,
    add_dataset: isCollectionAdmin,
    remove_dataset: isCollectionAdmin,
    transfer_ownership: isCollectionAdmin,
    delete: isCollectionAdmin,
    archive: isCollectionAdmin,
    unarchive: platformAdminOnly,

    list_grants: Policy.or([isCollectionAdmin, hasCollectionOversight]),
    manage_grants: isCollectionAdmin,
    review_access_requests: isCollectionAdmin,
    view_audit_logs: Policy.or([isCollectionAdmin, hasCollectionOversight]),
  })
  .roles([
    { policy: isCollectionAdmin, role: CallerRole.ADMIN },
    { policy: hasCollectionOversight, role: CallerRole.OVERSIGHT },
    {
      // COLLECTION:LIST_CONTENTS implies COLLECTION:VIEW_METADATA, so one check answers
      // whether the caller holds any collection grant.
      // @see docs/design/groups/decisions.md — 7. Access types imply one another
      policy: userHasGrant('COLLECTION:VIEW_METADATA'),
      role: CallerRole.GRANT_HOLDER,
    },
  ])
  .attributes({
  // all attributes are viewable/editable by admins, but for non-admins we restrict some attributes that might leak
  // sensitive information about the collection or its datasets
    '*': [
      {
        policy: isCollectionAdmin,
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: hasCollectionOversight,
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: userHasGrant('COLLECTION:VIEW_METADATA'),
        attribute_filters: PUBLIC_ATTRIBUTES.concat(PROFILE_ATTRIBUTES),
      },
    ],
    // Rules short-circuit on the first matching policy rather than combining, so these run
    // most-privileged first and the catch-all sits last. Anyone reaching this point has
    // already been granted view_profile.
    view_profile: [
      {
        policy: Policy.or([isCollectionAdmin, hasCollectionOversight]),
        attribute_filters: ['*'],
      },
      {
        policy: userHasGrant('COLLECTION:VIEW_METADATA'),
        attribute_filters: PUBLIC_ATTRIBUTES.concat(PROFILE_ATTRIBUTES),
      },
      {
        policy: Policy.always,
        attribute_filters: PUBLIC_PROFILE_ATTRIBUTES,
      },
    ],
    list: [
      {
        // for listing, we can't uniformly apply the attribute filters because
        // different collections in the list might have different permissions, so we will apply the PUBLIC_ATTRIBUTES filter
        policy: Policy.always,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
  })
  .freeze();

module.exports = {
  collectionPolicies,
  CallerRole,
  PUBLIC_ATTRIBUTES,
  PUBLIC_PROFILE_ATTRIBUTES,
  PROFILE_ATTRIBUTES,
};
