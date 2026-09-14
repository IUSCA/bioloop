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

const grant_attributes = [
  '*',
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
