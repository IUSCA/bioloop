const { GRANT_ACCESS_TYPES } = require('@/constants');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');
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
].concat(GROUP_PUBLIC_ATTRIBUTES.map((attr) => `owner_group.${attr}`)); // include owner group attributes with 'owner_group.' prefix

collectionPolicies
  .actions({
  // here isCollectionAdmin means the user is admin of the group that will be the owner of the collection
    create: Policy.or([isPlatformAdmin, isCollectionAdmin]),

    view_metadata: Policy.or([
      isPlatformAdmin,
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('COLLECTION:VIEW_METADATA')]),

    list: Policy.always, // anyone can list collections, but the results will be filtered based on their permissions
    list_datasets: Policy.or([
      isPlatformAdmin,
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('COLLECTION:LIST_CONTENTS')]),

    edit_metadata: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    add_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    remove_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    transfer_ownership: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    delete: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    archive: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    unarchive: isPlatformAdmin,

    list_grants: Policy.or([isPlatformAdmin, isCollectionAdmin, hasCollectionOversight]),
    manage_grants: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    review_requests: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    view_audit_logs: Policy.or([isPlatformAdmin, isCollectionAdmin, hasCollectionOversight]),
  })
  .roles([
    { policy: isPlatformAdmin, role: CallerRole.PLATFORM_ADMIN },
    { policy: isCollectionAdmin, role: CallerRole.ADMIN },
    { policy: hasCollectionOversight, role: CallerRole.OVERSIGHT },
    {
      policy: Policy.or([
        userHasGrant('COLLECTION:VIEW_METADATA'),
        userHasGrant('COLLECTION:LIST_CONTENTS')]),
      role: CallerRole.GRANT_HOLDER,
    },
  ])
  .attributes({
  // all attributes are viewable/editable by admins, but for non-admins we restrict some attributes that might leak
  // sensitive information about the collection or its datasets
    '*': [
      {
        policy: isPlatformAdmin,
        attribute_filters: ['*'], // * - all attributes
      },
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
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
    list: [
      {
        policy: isPlatformAdmin,
        attribute_filters: ['*'],
      },
      {
        // for listing, we can't uniformly apply the attribute filters because
        // different collections in the list might have different permissions, so we will apply the PUBLIC_ATTRIBUTES filter
        policy: Policy.always,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
  })
  .freeze();

module.exports = { collectionPolicies, CallerRole };
