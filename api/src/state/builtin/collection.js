const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What a collection's state admits.
 *
 * A collection is archived by its own column, or by its owning group's. That is one step: the
 * group that owns the collection, and no further up the tree.
 *
 * @see docs/design/groups/design.md — Archiving Groups
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
 */

const ARCHIVED = 'archived';

function archivedRefusal(collection) {
  if (collection.is_archived) {
    return refuse('This collection is archived, so it cannot be changed.', { state: ARCHIVED });
  }
  if (collection.owner_group.is_archived) {
    return refuse(
      "This collection's owning group is archived, so the collection cannot be changed.",
      { state: ARCHIVED },
    );
  }
  return null;
}

const notWhileArchived = rule({
  requires: ['is_archived', 'owner_group.is_archived'],
  check: archivedRefusal,
});

const collectionState = new StateContainer({
  resourceType: 'collection',
  description: "What a collection's archived state and its history admit",
}).rules({
  // A create has no row yet. The state it is placed into is the owning group's.
  create: rule({
    requires: ['owner_group.is_archived'],
    check: (prospective) => (prospective.owner_group.is_archived
      ? refuse('The owning group is archived, so it cannot take a new collection.', { state: ARCHIVED })
      : null),
  }),

  edit_metadata: notWhileArchived,
  add_dataset: notWhileArchived,
  remove_dataset: notWhileArchived,
  transfer_ownership: notWhileArchived,
  manage_grants: notWhileArchived,
  review_access_requests: notWhileArchived,

  // A collection that ever held a dataset, or that an access request names, is archived rather
  // than deleted, so the history stays answerable.
  delete: rule({
    requires: ['is_archived', 'owner_group.is_archived', 'has_history'],
    check: (collection) => archivedRefusal(collection)
      || (collection.has_history
        ? refuse('This collection has history, so it can be archived but not deleted.', { state: 'has_history' })
        : null),
  }),

  archive: rule({
    requires: ['is_archived', 'owner_group.is_archived'],
    check: (collection) => (collection.is_archived
      ? refuse('This collection is already archived.', { state: ARCHIVED })
      : archivedRefusal(collection)),
  }),
  unarchive: rule({
    requires: ['is_archived'],
    check: (collection) => (collection.is_archived ? null : refuse('This collection is not archived.')),
  }),

  view_metadata: always,
  view_profile: always,
  list_datasets: always,
  list_grants: always,
  view_audit_logs: always,
});

module.exports = { collectionState };
