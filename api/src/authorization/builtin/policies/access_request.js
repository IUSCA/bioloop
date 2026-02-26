const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');

class AccessRequestPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'access_request', requires, evaluate,
    });
  }
}

const isRequester = new AccessRequestPolicy({
  name: 'isRequester',
  requires: {
    user: ['id'],
    resource: ['requester_id'],
  },
  evaluate: (user, request) => user.id === request.requester_id,
});

const isAdminOfResourceGroup = new AccessRequestPolicy({
  name: 'isAdminOfResourceGroup',
  requires: {
    user: ['group_memberships'],
    resource: ['dataset_resource', 'collection_resource'],
  },
  evaluate: (user, request) => {
    const adminOfGroupIds = user.group_memberships
      .filter((membership) => membership.role === 'ADMIN')
      .map((membership) => membership.group_id);

    // one of the resources (dataset or collection) will be null
    const resourceOwningGroupId = request.dataset_resource?.owner_group_id
      || request.collection_resource?.owner_group_id;

    return adminOfGroupIds.includes(resourceOwningGroupId);
  },
});

const hasOversightOfResourceGroup = new AccessRequestPolicy({
  name: 'hasOversightOfResourceGroup',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['dataset_resource', 'collection_resource'],
  },
  evaluate: (user, request) => {
    const oversightGroupIds = user.oversight_group_ids || [];

    // one of the resources (dataset or collection) will be null
    const resourceOwningGroupId = request.dataset_resource?.owner_group_id
      || request.collection_resource?.owner_group_id;

    return oversightGroupIds.includes(resourceOwningGroupId);
  },
});

// Define policies for access requests
const accessRequestPolicies = new PolicyContainer({
  resourceType: 'access_request',
  version: '1.0.0',
  description: 'Policies for Access Requests resource',
});

accessRequestPolicies.actions({
  read: Policy.or([isRequester, isAdminOfResourceGroup, hasOversightOfResourceGroup]),
  review: isAdminOfResourceGroup,
}).freeze();

module.exports = {
  accessRequestPolicies,
};
