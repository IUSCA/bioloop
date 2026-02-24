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

const collectionPolicies = new PolicyContainer({
  resourceType: 'collection',
  version: '1.0.0',
  description: 'Policies for Collection resource',
});

collectionPolicies.actions({
  create: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  view_metadata: Policy.never, // TODO
  list_datasets: Policy.never, // TODO
  edit_metadata: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  add_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  remove_dataset: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  transfer_ownership: Policy.or([isPlatformAdmin, isCollectionAdmin]),
  delete: Policy.or([isPlatformAdmin, isCollectionAdmin]),
}).freeze();

module.exports = collectionPolicies;
