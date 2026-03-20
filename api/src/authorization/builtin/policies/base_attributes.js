const group_attributes = ['id', 'name', 'slug', 'description', 'metadata.type', 'is_archived', '_count.members'];

const collection_attributes = [
  'id', 'name', 'slug', 'description', 'metadata', 'created_at', 'updated_at',
  'is_archived', 'owner_group_id', '_count.datasets',
].concat(group_attributes.map((attr) => `owner_group.${attr}`));

const dataset_attributes = [
  'id', 'name', 'type', 'description', 'size', 'bundle_size', 'is_deleted',
  'created_at', 'updated_at', 'owner_group_id', 'resource_id',
].concat(group_attributes.map((attr) => `owner_group.${attr}`));

const user_attributes = [
  'id', 'name', 'email', 'username', 'is_deleted', 'subject_id',
];

const grant_attributes = [
  'id', 'subject_id', 'resource_id', 'access_type_id', 'access_type',
  'valid_from', 'valid_until', 'created_at', 'granted_by', 'justification', 'revoked_at', 'creation_type',
  'revoked_by', 'revocation_reason',
]
  .concat( // include resource attributes with 'resource.' prefix
    collection_attributes.map((attr) => `resource.collection.${attr}`),
  )
  .concat(
    dataset_attributes.map((attr) => `resource.dataset.${attr}`),
  )
  .concat(
    user_attributes.map((attr) => `subject.user.${attr}`),
  )
  .concat(
    group_attributes.map((attr) => `subject.group.${attr}`),
  )
  .concat(
    user_attributes.map((attr) => `grantor.${attr}`),
  )
  .concat(
    user_attributes.map((attr) => `revoker.${attr}`),
  );

module.exports = Object.freeze({
  dataset: dataset_attributes,
  group: group_attributes,
  collection: collection_attributes,
  user: user_attributes,
  grant: grant_attributes,
});
