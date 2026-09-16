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
    ),
    update: mutating(isRequester),
    // Submitting and withdrawing are actions of their own rather than uses of `update`, because
    // the request's state admits them in different statuses and the capability map can only say
    // "Withdraw" when withdraw is an action of its own.
    // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
    submit: mutating(isRequester),
    withdraw: mutating(isRequester),
    // The meaningful check on creation is on the resource being asked for, not on the
    // request. A create body names a `resource_id` and no resource type, so which policy
    // container applies is not known until the `resource` row is read; the route reads it
    // and authorizes `view_metadata` on the dataset or collection itself.
    // Whether the resource is archived or deleted is not asked here. The request's own state
    // rule for `create` reads the resource it names, and the service refuses with 409. The
    // subject rules — self, or a group the requester administers — stay in
    // `_validateAccessRequestSubject`.
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
