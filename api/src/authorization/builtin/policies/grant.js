const collectionService = require('@/services/collections');
const datasetService = require('@/services/datasets_v2');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const baseAttributes = require('./base_attributes');

class GrantPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'grant', requires, evaluate,
    });
  }
}

async function getResourceOwningGroupId(grant) {
  let resourceOwningGroupId;
  if (grant.resource_type === 'DATASET') {
    const dataset = await datasetService.getDatasetById(grant.resource_id);
    resourceOwningGroupId = dataset.owner_group_id;
  } else if (grant.resource_type === 'COLLECTION') {
    const collection = await collectionService.getCollectionById(grant.resource_id);
    resourceOwningGroupId = collection.owner_group_id;
  } else {
    throw new Error(`Unknown resource type: ${grant.resource_type}`);
  }
  return resourceOwningGroupId;
}

const isAdminOfResourceGroup = new GrantPolicy({
  name: 'isAdminOfResourceGroup',
  requires: {
    user: ['group_memberships'],
    resource: ['resource_id', 'resource_type'], // dataset_resource or collection_resource
  },
  evaluate: async (user, grant) => {
    const adminOfGroupIds = user.group_memberships
      .filter((membership) => membership.role === 'ADMIN')
      .map((membership) => membership.group_id);

    // fetch the resource to get the owning group id
    const resourceOwningGroupId = await getResourceOwningGroupId(grant);
    return adminOfGroupIds.includes(resourceOwningGroupId);
  },
});

const hasOversightOfResourceGroup = new GrantPolicy({
  name: 'hasOversightOfResourceGroup',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['resource_id', 'resource_type'], // dataset_resource or collection_resource
  },
  evaluate: async (user, grant) => {
    const oversightGroupIds = user.oversight_group_ids || [];

    // one of the resources (dataset or collection) will be null
    const resourceOwningGroupId = await getResourceOwningGroupId(grant);
    return oversightGroupIds.includes(resourceOwningGroupId);
  },
});

const isSubject = new GrantPolicy({
  name: 'isSubject',
  requires: {
    // A subject id is a UUID; `user.id` is the integer primary key, so comparing the two
    // made this policy unsatisfiable and every caller fell through to the next arm.
    user: ['subject_id'],
    resource: ['subject_id', 'subject_type'], // subject can be a user or a group
  },
  evaluate: (user, grant) => grant.subject_type === 'USER'
    && user.subject_id === grant.subject_id,
});

const isAdminOfSubjectGroup = new GrantPolicy({
  name: 'isAdminOfSubjectGroup',
  requires: {
    user: ['group_memberships'],
    resource: ['subject_id', 'subject_type'], // subject can be a user or a group
  },
  evaluate: (user, grant) => {
    if (grant.subject_type !== 'GROUP') {
      return false;
    }
    const adminOfGroupIds = user.group_memberships
      .filter((membership) => membership.role === 'ADMIN')
      .map((membership) => membership.group_id);
    return adminOfGroupIds.includes(grant.subject_id);
  },
});

const hasOversightOfSubjectGroup = new GrantPolicy({
  name: 'hasOversightOfSubjectGroup',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['subject_id', 'subject_type'], // subject can be a user or a group
  },
  evaluate: (user, grant) => {
    if (grant.subject_type !== 'GROUP') {
      return false;
    }
    const oversightGroupIds = user.oversight_group_ids || [];
    return oversightGroupIds.includes(grant.subject_id);
  },
});

// Define policies for grants
const grantPolicies = new PolicyContainer({
  resourceType: 'grant',
  version: '1.0.0',
  description: 'Policies for Grants resource',
});

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
grantPolicies
  .actions({
    create: isAdminOfResourceGroup,
    read: Policy.or([isAdminOfResourceGroup, hasOversightOfResourceGroup]),
    revoke: isAdminOfResourceGroup,
    list_for_resource: Policy.or([isAdminOfResourceGroup, hasOversightOfResourceGroup]),
    list_for_subject: Policy.or([isSubject, isAdminOfSubjectGroup, hasOversightOfSubjectGroup]),

    // Everything that reaches one subject on one resource, and how each grant arrives.
    // The question names both a subject and a resource, so either side's authority answers
    // it: a requester asking what they already hold before filing a request, and a reviewer
    // deciding whether an approval would change anything. Neither `list_for_resource` nor
    // `list_for_subject` covers both, and widening either would let one side's authority
    // reach rows the other side owns.
    // @see docs/design/groups/access-requests-plan.md — C1
    view_coverage: Policy.or([
      isSubject,
      isAdminOfSubjectGroup,
      hasOversightOfSubjectGroup,
      isAdminOfResourceGroup,
      hasOversightOfResourceGroup,
    ]),
    list: Policy.always, // listing grants is allowed, but the results will be filtered based on the user's permissions
  })
  .attributes({
    '*': [
      {
        policy: Policy.always,
        attribute_filters: baseAttributes.grant,
      },
    ],
  })
  .freeze();

module.exports = {
  grantPolicies,
};
