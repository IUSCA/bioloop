const collectionService = require('@/services/collections');
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
    user: ['id'],
    resource: ['id'],
  },
  evaluate: (user, collection) => collectionService.userHasGrant({
    user_id: user.id,
    collection_id: collection.id,
    access_type,
  }),
});

const isMemberOfOwningGroup = new CollectionPolicy({
  name: 'isMemberOfOwningGroup',
  requires: {
    user: ['all_group_ids'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, collection) => user
    .all_group_ids
    .includes(collection.owner_group_id),
});

const collectionPolicies = new PolicyContainer({
  resourceType: 'collection',
  version: '1.0.0',
  description: 'Policies for Collection resource',
});

collectionPolicies.actions({
  create: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  view_metadata: Policy.or([isPlatformAdmin, isMemberOfOwningGroup, userHasGrant('view_metadata')]),
  list_datasets: Policy.or([isPlatformAdmin, isCollectionAdmin, userHasGrant('view_datasets')]),
  edit_metadata: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  add_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  remove_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  transfer_ownership: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  delete: Policy.or([isPlatformAdmin, isCollectionAdmin]),
}).freeze();

module.exports = { collectionPolicies };
