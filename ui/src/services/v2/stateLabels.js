/**
 * The words the archive dialogs show for each action the archived state forbids, keyed by
 * qualified action.
 *
 * A dialog asks each resource type what its archived state forbids and shows these words for
 * the answers, so its list follows the state rules rather than restating them. Several actions
 * share words, and a dialog shows each phrase once, in the order of this table.
 * `api/tests/model/stateLabels.test.js` fails when a forbidden action has no entry here, or an
 * entry names an action the archived state admits. The answers come from
 * `GET /v2/states/:type/archived/forbidden-actions`, one call per resource type in the dialog's
 * scope.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const MEMBERSHIP = "Add or remove members, or change their roles";
const GRANTS = "Give access or revoke existing access";
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
  "access_request.submit": REQUESTS,
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
  "group.create_child": "Create subgroups",
  "group.edit_metadata": DETAILS,
  "collection.edit_metadata": DETAILS,
  "dataset.edit_metadata": DETAILS,
  "dataset.edit": DETAILS,
  "dataset.request_stage": "Stage datasets",
  "dataset.delete": "Delete datasets",
  "group.archive": "Archive subgroups",
  "collection.archive": "Archive collections",
  "collection.delete": "Delete collections",
  "collection.transfer_ownership": OWNERSHIP,
  "dataset.transfer_ownership": OWNERSHIP,
};

/**
 * The phrases for the forbidden actions on the given resource types, each once, in table order.
 * @param {string[]} forbiddenActions - qualified actions, as the API sent them
 * @param {string[]} resourceTypes - the types this dialog lists
 * @returns {string[]}
 */
export function prohibitedLabels(forbiddenActions, resourceTypes) {
  const forbidden = new Set(forbiddenActions);
  const labels = [];
  Object.entries(ACTION_LABELS).forEach(([action, label]) => {
    const inScope = resourceTypes.includes(action.split(".")[0]);
    if (inScope && forbidden.has(action) && !labels.includes(label)) {
      labels.push(label);
    }
  });
  return labels;
}
