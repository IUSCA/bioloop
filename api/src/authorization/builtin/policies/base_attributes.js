const group_attributes = ['id', 'name', 'slug', 'description', 'metadata.type', 'is_archived', '_count.members'];

const collection_attributes = [
  'id', 'name', 'slug', 'description', 'metadata', 'created_at', 'updated_at',
  'is_archived', 'owner_group_id', '_count.datasets',
].concat(group_attributes.map((attr) => `owner_group.${attr}`));

// What every caller authorized for a dataset action may see.
//
// `is_staged` is here rather than in the elevated lists because a grant holder who may
// request staging has to be able to see that it finished. It says whether the bytes sit on
// fast storage, and carries no path and no identity.
//
// Withheld: `metadata` as a whole, until a specific key such as `metadata.type` earns a rule
// of its own; `num_directories` and `du_size` as internal accounting; `num_files` except to a
// caller who may list files, since browsing the tree shows it;
// `src_instrument_id` until a caller has a reason to see it; and `origin_path`,
// `archive_path`, and `staged_path` as infrastructure detail. Each needs
// view_sensitive_metadata or a structural role.
const dataset_attributes = [
  'id', 'name', 'type', 'description', 'size', 'bundle_size', 'is_deleted', 'is_staged',
  'created_at', 'updated_at', 'owner_group_id', 'resource_id',
].concat(group_attributes.map((attr) => `owner_group.${attr}`));

const user_attributes = [
  'id', 'name', 'email', 'username', 'is_deleted', 'subject_id',
];

// A grant's subject and resource, as a grouped grant list returns them beside the grants.
const subject_attributes = ['id', 'type']
  .concat(user_attributes.map((attr) => `user.${attr}`))
  .concat(group_attributes.map((attr) => `group.${attr}`));

const resource_attributes = ['id', 'type']
  .concat(dataset_attributes.map((attr) => `dataset.${attr}`))
  .concat(collection_attributes.map((attr) => `collection.${attr}`));

const access_type_attributes = ['id', 'name', 'description', 'long_description', 'category', 'is_requestable'];

// Every field of a grant row is named, so a column added to the table or a relation added to
// an include is withheld until someone lists it here. `expiry` and `is_active` are computed.
// The flat `access_type_name` and `access_type_description` are what the grouped SQL lists
// select in place of the relation.
// @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 5
const grant_attributes = [
  'id', 'subject_id', 'resource_id', 'access_type_id',
  'valid_from', 'valid_until', 'expiry', 'is_active',
  'granted_by', 'justification', 'created_at', 'creation_type',
  'revoked_at', 'revoked_by', 'revocation_reason', 'revocation_type',
  'issuing_authority_id', 'revoking_authority_id', 'source_access_request_id', 'source_preset_id',
  'access_type_name', 'access_type_description',
  'issuing_authority.id', 'issuing_authority.name',
  'revoking_authority.id', 'revoking_authority.name',
  'source_preset.id', 'source_preset.name',
  'source_access_request.id', 'source_access_request.purpose', 'source_access_request.status',
  'source_access_request.reviewed_at', 'source_access_request.decision_reason',
  'source_access_request.requester.name', 'source_access_request.requester.email',
]
  .concat(access_type_attributes.map((attr) => `access_type.${attr}`))
  .concat(resource_attributes.map((attr) => `resource.${attr}`))
  .concat(subject_attributes.map((attr) => `subject.${attr}`))
  .concat(user_attributes.map((attr) => `grantor.${attr}`))
  .concat(user_attributes.map((attr) => `revoker.${attr}`));

// A row of `getEffectiveCoverage` after `labelCoverage`: a grant reaching a subject, and the
// path it arrives by. Every key the service produces is named.
const coverage_attributes = [
  'id', 'subject_id', 'resource_id', 'access_type_id', 'valid_from', 'valid_until',
  'source_access_request_id', 'source_preset_id', 'access_type_name', 'access_type_description',
  'via', 'via_group_id', 'via_group_name', 'via_collection_id', 'via_collection_name',
];

module.exports = Object.freeze({
  dataset: dataset_attributes,
  group: group_attributes,
  collection: collection_attributes,
  user: user_attributes,
  grant: grant_attributes,
  subject: subject_attributes,
  resource: resource_attributes,
  coverage: coverage_attributes,
});
