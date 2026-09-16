const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What a dataset's state admits.
 *
 * Two states reach a dataset. Deleting one sets `is_deleted` and removes its archived files, and
 * it cannot be undone, so a deleted dataset keeps its record and admits nothing that changes it or
 * reads its bytes. An archived owning group stops changes and leaves the bytes readable, because
 * archiving closes governance rather than access.
 *
 * @see docs/design/groups/design.md — Operation Effects
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const DELETED = 'deleted';
const ARCHIVED = 'archived';

const deletedRefusal = (dataset, what) => (dataset.is_deleted
  ? refuse(`This dataset is deleted, so ${what}.`, { state: DELETED })
  : null);

const notWhileDeletedOrOwnerArchived = rule({
  requires: ['is_deleted', 'owner_group.is_archived'],
  check: (dataset) => deletedRefusal(dataset, 'it cannot be changed')
    || (dataset.owner_group.is_archived
      ? refuse("This dataset's owning group is archived, so the dataset cannot be changed.", { state: ARCHIVED })
      : null),
});

/** Reading the bytes. A deleted dataset has none; an archived owning group changes nothing here. */
const notWhileDeleted = rule({
  requires: ['is_deleted'],
  check: (dataset) => deletedRefusal(dataset, 'its files are gone'),
});

const datasetState = new StateContainer({
  resourceType: 'dataset',
  description: "What a dataset's deleted state and its owning group's archived state admit",
}).rules({
  create: rule({
    requires: ['owner_group.is_archived'],
    check: (prospective) => (prospective.owner_group.is_archived
      ? refuse('The owning group is archived, so it cannot take a new dataset.', { state: ARCHIVED })
      : null),
  }),

  contribute: notWhileDeletedOrOwnerArchived,
  request_stage: notWhileDeletedOrOwnerArchived,
  edit_metadata: notWhileDeletedOrOwnerArchived,
  edit: notWhileDeletedOrOwnerArchived,
  transfer_ownership: notWhileDeletedOrOwnerArchived,
  manage_grants: notWhileDeletedOrOwnerArchived,
  review_access_requests: notWhileDeletedOrOwnerArchived,

  delete: rule({
    requires: ['is_deleted', 'owner_group.is_archived'],
    check: (dataset) => {
      if (dataset.is_deleted) {
        return refuse('This dataset is already deleted.', { state: DELETED });
      }
      if (dataset.owner_group.is_archived) {
        return refuse(
          "This dataset's owning group is archived, so the dataset cannot be deleted.",
          { state: ARCHIVED },
        );
      }
      return null;
    },
  }),

  list_files: notWhileDeleted,
  read_data: notWhileDeleted,
  download: notWhileDeleted,
  compute: notWhileDeleted,
  remote_access: notWhileDeleted,

  view_metadata: always,
  view_sensitive_metadata: always,
  view_audit_logs: always,
  view_workflows: always,
  view_collections: always,
  view_source_datasets: always,
  view_derived_datasets: always,
});

module.exports = { datasetState };
