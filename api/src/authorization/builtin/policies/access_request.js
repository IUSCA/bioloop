const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { mutating, reading } = require('../../core/policies/PolicyContainer');

class AccessRequestPolicy extends Policy {
  constructor({
    name, requires, evaluate, meta,
  }) {
    super({
      name, resourceType: 'access_request', requires, evaluate, meta,
    });
  }
}

const isRequester = new AccessRequestPolicy({
  name: 'isRequester',
  meta: { pathKind: 'self' },
  requires: {
    user: ['subject_id'],
    resource: ['requester_id'],
  },
  evaluate: (user, request) => user.subject_id === request.requester_id,
});

const isAdminOfResourceGroup = new AccessRequestPolicy({
  name: 'isAdminOfResourceGroup',
  meta: { pathKind: 'admin' },
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
  meta: { pathKind: 'oversight' },
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

/**
 * Reads an access request's lifecycle state for the transition table.
 * @see docs/design/groups/access-model.md — The transition table
 */
const requestState = (from, to) => ({
  requires: ['status'],
  stateOf: (request) => request.status,
  from,
  to,
});

// Define policies for access requests
const accessRequestPolicies = new PolicyContainer({
  resourceType: 'access_request',
  version: '1.0.0',
  description: 'Policies for Access Requests resource',
});

accessRequestPolicies
  .actions({
    read: reading(Policy.or([isRequester, isAdminOfResourceGroup, hasOversightOfResourceGroup])),
    review: mutating(
      isAdminOfResourceGroup,
      requestState(['UNDER_REVIEW'], ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED']),
    ),
    update: mutating(isRequester, requestState(['DRAFT'], ['DRAFT'])),
    // Submitting and withdrawing were bound to `update`. They are separate actions because the
    // transition table admits them in different states, and the capability map can only say
    // "Withdraw" when withdraw is an action of its own.
    // @see docs/design/groups/access-model.md — The transition table
    submit: mutating(isRequester, requestState(['DRAFT'], ['UNDER_REVIEW'])),
    withdraw: mutating(isRequester, requestState(['DRAFT', 'UNDER_REVIEW'], ['WITHDRAWN'])),
    // The meaningful check on creation is on the resource being asked for, not on the
    // request. A create body names a `resource_id` and no resource type, so which policy
    // container applies is not known until the `resource` row is read; the route reads it
    // and authorizes `view_metadata` on the dataset or collection itself.
    //
    // This binding is not decorative. `restrictionTargetFor` follows an access_request
    // through to `preFetchedResource.resource_id`, so it is the path by which an ARCHIVED
    // restriction reaches request creation. The subject rules — self, or a group the
    // requester administers — stay in `_validateAccessRequestSubject`.
    // @see docs/design/groups/implementation/access-requests-plan.md — A1
    create: mutating(Policy.always),
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
