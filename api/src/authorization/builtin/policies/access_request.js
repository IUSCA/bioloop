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
    user: ['subject_id'],
    resource: ['requester_id'],
  },
  evaluate: (user, request) => user.subject_id === request.requester_id,
});

const isAdminOfResourceGroup = new AccessRequestPolicy({
  name: 'isAdminOfResourceGroup',
  requires: {
    user: ['group_memberships'],
    resource: ['resource2'],
  },
  evaluate: (user, request) => {
    const adminOfGroupIds = user.group_memberships
      .filter((membership) => membership.role === 'ADMIN')
      .map((membership) => membership.group_id);

    // one of the resources (dataset or collection) will be null
    const resourceOwningGroupId = request.resource2.dataset?.owner_group_id
      || request.resource2.collection?.owner_group_id;

    return adminOfGroupIds.includes(resourceOwningGroupId);
  },
});

const hasOversightOfResourceGroup = new AccessRequestPolicy({
  name: 'hasOversightOfResourceGroup',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['resource2'],
  },
  evaluate: (user, request) => {
    const oversightGroupIds = user.oversight_group_ids || [];

    // one of the resources (dataset or collection) will be null
    const resourceOwningGroupId = request.resource2.dataset?.owner_group_id
      || request.resource2.collection?.owner_group_id;

    return oversightGroupIds.includes(resourceOwningGroupId);
  },
});

/**
 * Policy for creating access requests
 *
 * Rules:
 * 1. Self-request: subject_id == requester_id (always allowed)
 * 2. Group request: subject must be a GROUP and requester must be ADMIN of that group
 * 3. Other-user request: NOT allowed (disallowed)
 *
 * For a create action, the resource is the request body data (subject_id, etc.)
 * The requester_id is implicitly the authenticated user.
 */
// const canCreateAccessRequest = new AccessRequestPolicy({
//   name: 'canCreateAccessRequest',
//   requires: {
//     user: ['subject_id', 'group_memberships'],
//     resource: ['subject_id'],
//   },
//   evaluate: (user, requestData) => {
//     const { subject_id } = requestData;

//     // Rule 1: Self-request (subject is the requester themselves)
//     if (subject_id === user.subject_id) {
//       return true;
//     }

//     // Rule 2: Group request (subject must be a GROUP and requester must be ADMIN)
//     const adminOfGroupIds = user.group_memberships
//       .filter((membership) => membership.role === 'ADMIN')
//       .map((membership) => membership.group_id);
//     return adminOfGroupIds.includes(subject_id);

//     // Rule 3: Other-user request is disallowed
//     // return false;
//   },
// });

// Define policies for access requests
const accessRequestPolicies = new PolicyContainer({
  resourceType: 'access_request',
  version: '1.0.0',
  description: 'Policies for Access Requests resource',
});

accessRequestPolicies
  .actions({
    read: Policy.or([isRequester, isAdminOfResourceGroup, hasOversightOfResourceGroup]),
    review: isAdminOfResourceGroup,
    update: isRequester,
    create: Policy.always, // enforced at service level with canCreateAccessRequest policy logic
  })
  .attributes({
    '*': [
      {
        policy: Policy.always,
        attribute_filters: ['*'],
      },
    ],
  })
  .freeze();

module.exports = {
  accessRequestPolicies,
};
