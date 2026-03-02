const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');

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

const userHasGrant = (access_type) => new CollectionPolicy({
  name: 'userHasGrant',
  requires: {
    user: [],
    resource: [],
    context: ['active_grant_access_types'],
  },
  evaluate: (user, dataset, context) => context.active_grant_access_types.has(access_type),
});

const hasCollectionOversight = new CollectionPolicy({
  name: 'hasCollectionOversight',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, collection) => user.oversight_group_ids.includes(collection.owner_group_id),
});

const CallerRole = Object.freeze({
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

collectionPolicies
  .actions({
  // here isCollectionAdmin means the user is admin of the group that will be the owner of the collection
    create: Policy.or([isPlatformAdmin, isCollectionAdmin]),

    view_metadata: Policy.or([
      isPlatformAdmin,
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('view_metadata')]),

    list_datasets: Policy.or([
      isPlatformAdmin,
      isCollectionAdmin,
      hasCollectionOversight,
      userHasGrant('list_datasets')]),

    edit_metadata: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    add_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    remove_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    transfer_ownership: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    delete: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    archive: Policy.or([isPlatformAdmin, isCollectionAdmin]),
    unarchive: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  })
  .roles([
    { policy: isPlatformAdmin, role: CallerRole.ADMIN },
    { policy: isCollectionAdmin, role: CallerRole.ADMIN },
    { policy: hasCollectionOversight, role: CallerRole.OVERSIGHT },
    {
      policy: Policy.or([
        userHasGrant('view_metadata'),
        userHasGrant('list_datasets')]),
      role: CallerRole.GRANT_HOLDER,
    },
  ])
  .attributes({
  // all attributes are viewable/editable by admins, but for non-admins we restrict some attributes that might leak
  // sensitive information about the collection or its datasets
    '*': [
      {
        policy: Policy.or([isPlatformAdmin, isCollectionAdmin, hasCollectionOversight]),
        attribute_filters: ['*'], // * - all attributes
      },
      {
        policy: userHasGrant('view_metadata'),
        attribute_filters: [
          'id', 'name', 'slug', 'description', 'metadata', 'created_at', 'updated_at', 'owner_group_id', 'is_archived',
        ],
      },
    ],
  })
  .freeze();

module.exports = { collectionPolicies, CallerRole };
