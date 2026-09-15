/**
 * The words the archive dialogs show for each action a restriction blocks, keyed by qualified
 * action.
 *
 * A dialog asks the API which actions ARCHIVED blocks and shows these words for them, so its
 * list follows the restriction layer rather than restating it. Several actions share words, and
 * a dialog shows each phrase once, in the order of this table.
 * `api/tests/model/restrictionLabels.test.js` fails when a blocked action has no entry here, or
 * an entry names an action nothing blocks.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 6: restrictions, operations, and creates
 */

const MEMBERSHIP = "Add or remove members, or change their roles";
const GRANTS = "Create new grants or revoke existing grants";
const REQUESTS = "File, change, or review access requests";
const DATASETS = "Create or import datasets";
const COLLECTIONS = "Create collections";
const CONTENTS = "Modify collection contents";
const DETAILS = "Edit names, descriptions, and profiles";
const OWNERSHIP = "Transfer ownership";

export const ACTION_LABELS = {
  "group.add_member": MEMBERSHIP,
  "group.remove_member": MEMBERSHIP,
  "group.edit_member_role": MEMBERSHIP,
  "group.invite": "Invite people to join",
  "grant.create": GRANTS,
  "grant.revoke": GRANTS,
  "dataset.manage_grants": GRANTS,
  "collection.manage_grants": GRANTS,
  "access_request.create": REQUESTS,
  "access_request.update": REQUESTS,
  "access_request.submit": REQUESTS,
  "access_request.withdraw": REQUESTS,
  "access_request.review": REQUESTS,
  "dataset.review_access_requests": REQUESTS,
  "collection.review_access_requests": REQUESTS,
  "group.add_dataset": DATASETS,
  "dataset.create": DATASETS,
  "dataset.contribute": DATASETS,
  "group.add_collection": COLLECTIONS,
  "collection.create": COLLECTIONS,
  "collection.add_dataset": CONTENTS,
  "collection.remove_dataset": CONTENTS,
  "group.create": "Create subgroups",
  "group.create_child": "Create subgroups",
  "group.edit_metadata": DETAILS,
  "collection.edit_metadata": DETAILS,
  "dataset.edit_metadata": DETAILS,
  "dataset.edit": DETAILS,
  "dataset.request_stage": "Stage datasets",
  "dataset.archive": "Archive datasets to tape",
  "group.archive": "Archive subgroups",
  "collection.archive": "Archive collections",
  "collection.delete": "Delete collections",
  "collection.transfer_ownership": OWNERSHIP,
  "dataset.transfer_ownership": OWNERSHIP,
};

/**
 * The phrases for the blocked actions on the given resource types, each once, in table order.
 * @param {string[]} blockedActions - qualified actions, as the API sent them
 * @param {string[]} resourceTypes - the types the restriction reaches from this dialog
 * @returns {string[]}
 */
export function prohibitedLabels(blockedActions, resourceTypes) {
  const blocked = new Set(blockedActions);
  const labels = [];
  Object.entries(ACTION_LABELS).forEach(([action, label]) => {
    const inScope = resourceTypes.includes(action.split(".")[0]);
    if (inScope && blocked.has(action) && !labels.includes(label)) {
      labels.push(label);
    }
  });
  return labels;
}
