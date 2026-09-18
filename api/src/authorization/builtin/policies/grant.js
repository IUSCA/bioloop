const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { mutating, reading } = require('../../core/policies/PolicyContainer');
const baseAttributes = require('./base_attributes');

class GrantPolicy extends Policy {
  constructor({
    name, requires, evaluate, meta,
  }) {
    super({
      name, resourceType: 'grant', requires, evaluate, meta,
    });
  }
}

const isAdminOfResourceGroup = new GrantPolicy({
  name: 'isAdminOfResourceGroup',
  meta: { pathKind: 'admin' },
  requires: {
    user: ['group_memberships'],
    resource: ['resource_owner_group_id'],
  },
  evaluate: (user, grant) => user.group_memberships.some(
    (membership) => membership.role === 'ADMIN' && membership.group_id === grant.resource_owner_group_id,
  ),
});

const hasOversightOfResourceGroup = new GrantPolicy({
  name: 'hasOversightOfResourceGroup',
  meta: { pathKind: 'oversight' },
  requires: {
    user: ['oversight_group_ids'],
    resource: ['resource_owner_group_id'],
  },
  evaluate: (user, grant) => user.oversight_group_ids.includes(grant.resource_owner_group_id),
});

const isSubject = new GrantPolicy({
  name: 'isSubject',
  meta: { pathKind: 'self' },
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
  meta: { pathKind: 'admin', of: 'subject' },
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
  meta: { pathKind: 'oversight', of: 'subject' },
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
    create: mutating(isAdminOfResourceGroup),
    read: reading(Policy.or([isAdminOfResourceGroup, hasOversightOfResourceGroup])),
    // A grant is revoked once. Supersession and expiry are the system's transitions, not an
    // action anybody takes.
    // @see docs/design/groups/access-model.md — The transition table
    revoke: mutating(isAdminOfResourceGroup),
    // A list query scopes its grants to the caller, so the action itself admits anyone.
    list: reading(Policy.always),
    list_for_resource: reading(Policy.or([isAdminOfResourceGroup, hasOversightOfResourceGroup])),
    list_for_subject: reading(Policy.or([isSubject, isAdminOfSubjectGroup, hasOversightOfSubjectGroup])),

    // Everything that reaches one subject on one resource, and how each grant arrives.
    // The question names both a subject and a resource, so either side's authority answers
    // it: a requester asking what they already hold before filing a request, and a reviewer
    // deciding whether an approval would change anything. Neither `list_for_resource` nor
    // `list_for_subject` covers both, and widening either would let one side's authority
    // reach rows the other side owns.
    // @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
    view_coverage: reading(Policy.or([
      isSubject,
      isAdminOfSubjectGroup,
      hasOversightOfSubjectGroup,
      isAdminOfResourceGroup,
      hasOversightOfResourceGroup,
    ])),
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
