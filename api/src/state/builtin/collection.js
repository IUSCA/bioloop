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
  description: "What a collection's archived state admits",
  select: {
    is_archived: true,
    owner_group: { select: { is_archived: true } },
  },
  examples: {
    // The archived state in force, however it arrived: the collection's own column and its
    // owning group's. A dialog asking what archiving forbids wants the whole answer, and the
    // two sources refuse the same actions, so naming both states it once.
    archived: { is_archived: true, owner_group: { is_archived: true } },
  },
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

  list: always,
  view_metadata: always,
  view_profile: always,
  list_datasets: always,
  list_grants: always,
  view_audit_logs: always,
});

module.exports = { collectionState };
