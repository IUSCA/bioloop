const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What a group's state admits.
 *
 * Archiving is a governance boundary closure: membership, invitations, and what the group owns
 * stop changing, and reading goes on. It reaches this group only. A sub-group keeps its own state
 * until somebody archives it, so no rule here reads the group tree.
 *
 * @see docs/design/groups/design.md — Archiving Groups
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const ARCHIVED = 'archived';

/** A mutation of the group itself, or of what it owns. */
const notWhileArchived = rule({
  requires: ['is_archived'],
  check: (group) => (group.is_archived
    ? refuse('This group is archived, so it cannot be changed.', { state: ARCHIVED })
    : null),
});

const groupState = new StateContainer({
  resourceType: 'group',
  description: "What a group's archived state admits",
}).rules({
  // A root group has no parent, so nothing carries state into its creation.
  create: always,
  create_child: notWhileArchived,

  archive: rule({
    requires: ['is_archived'],
    check: (group) => (group.is_archived
      ? refuse('This group is already archived.', { state: ARCHIVED })
      : null),
  }),
  // The way out of the archived state, so the archived state cannot refuse it.
  unarchive: rule({
    requires: ['is_archived'],
    check: (group) => (group.is_archived ? null : refuse('This group is not archived.')),
  }),

  edit_metadata: notWhileArchived,
  add_member: notWhileArchived,
  remove_member: notWhileArchived,
  edit_member_role: notWhileArchived,
  invite: notWhileArchived,
  add_dataset: notWhileArchived,
  add_collection: notWhileArchived,

  view_metadata: always,
  view_profile: always,
  view_hierarchy: always,
  list_invalid: always,
  view_audit_logs: always,
  view_members: always,
  view_ancestors: always,
  view_descendants: always,
  view_invitations: always,
});

module.exports = { groupState };
