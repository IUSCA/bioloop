/**
 * Rows as a caller fetches them for a grant's or an access request's state rules: a `resource`
 * fetched with `TARGET_SELECT` and a `subject` fetched with `SUBJECT_SELECT`.
 *
 * @see src/state/builtin/targets.js
 */

/** A dataset resource row. A dataset's archived state is its owning group's. */
const datasetResource = ({ archived = false, deleted = false } = {}) => ({
  type: 'DATASET',
  dataset: { is_deleted: deleted, owner_group: { is_archived: archived } },
});

/** A collection resource row, archived itself or through its owning group. */
const collectionResource = ({ archived = false, ownerArchived = false } = {}) => ({
  type: 'COLLECTION',
  collection: { is_archived: archived, owner_group: { is_archived: ownerArchived } },
});

/** A subject row for a user, which has no group. */
const userSubject = () => ({ group: null });

/** A subject row for a group. */
const groupSubject = ({ archived = false } = {}) => ({ group: { is_archived: archived } });

module.exports = {
  datasetResource, collectionResource, userSubject, groupSubject,
};
