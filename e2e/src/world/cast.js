/**
 * The cast the flows are written against, and where each person stands.
 *
 * Nobody here is created. The suite borrows seeded accounts and assigns them standing in
 * groups it builds, because the seed already ships both shapes a flow needs and because
 * creating an account fires the `USER_CREATED` hook that applies pending invitations — a
 * path the invitation flows exist to test rather than a side effect of every run.
 *
 * @see docs/design/groups/e2e-test-flows.md — The cast and the world
 * @see docs/design/groups/e2e-test-plan.md — Build the world, borrow the people
 */

/**
 * Seeded accounts with a fixed meaning. Neither is drawn from the borrowable pool, and the
 * world builder excludes both by name, so no assigned person can end up sharing an account
 * with the platform admin or with the zero-access user.
 */
const FIXED_ACCOUNTS = Object.freeze({
  // Platform admin. Used only where a flow requires one: the engine allows a platform admin
  // before any policy runs, so a spec driven as Priya exercises no policy path.
  priya: 'test_user',
  // The zero-access user. Belongs to nothing and holds nothing.
  quinn: 'ajohnson',
});

/**
 * The six people whose standing the world builder assigns. The account behind each is
 * chosen at build time from the seeded `user-0NN` pool, because which of them administers
 * what in the seed is decided by a hash and moves whenever the seed changes.
 *
 * `group` names a key in the hierarchy below; `role` is the standing to grant there.
 */
const ASSIGNED_CAST = Object.freeze([
  { key: 'dana', group: 'center', role: 'ADMIN' },
  { key: 'alice', group: 'lab', role: 'ADMIN' },
  { key: 'bob', group: 'lab', role: 'MEMBER' },
  { key: 'carol', group: 'subLab', role: 'MEMBER' },
  { key: 'erin', group: 'siblingLab', role: 'ADMIN' },
  { key: 'frank', group: 'siblingLab', role: 'MEMBER' },
]);

/**
 * Standing a person holds beyond their one entry above.
 *
 * Kept separate because `ASSIGNED_CAST` is also the borrow list — one seeded account per
 * entry — so a second row for the same person would lend them a second account and the two
 * would overwrite each other. One person, one account, any number of group memberships.
 */
const EXTRA_STANDING = Object.freeze([
  { key: 'alice', group: 'requestLab', role: 'ADMIN' },
  // Bob is a member here as well as of `lab`, so the grant flows can assert what an ordinary
  // member of an owning group reads without putting their datasets in `lab`.
  { key: 'bob', group: 'requestLab', role: 'MEMBER' },
]);

/**
 * Four groups, two levels deep, which is the shallowest shape that can express every
 * relationship the flows assert: membership rising through two levels, oversight falling
 * through two, and a sibling branch that neither reaches.
 *
 *   center
 *   ├── lab
 *   │   └── subLab
 *   └── siblingLab
 */
const HIERARCHY = Object.freeze([
  { key: 'center', parent: null, suffix: 'center', type: 'center' },
  { key: 'lab', parent: 'center', suffix: 'lab', type: 'lab' },
  { key: 'subLab', parent: 'lab', suffix: 'sub-lab', type: 'lab' },
  { key: 'siblingLab', parent: 'center', suffix: 'sibling-lab', type: 'lab' },
  // A lab of its own for the request flows, administered by the same person as `lab`.
  //
  // The request flows need datasets the sibling lab can see and not read, and a grant on a
  // dataset makes its *owning group* visible too — measured: with one metadata grant on a
  // lab-owned dataset, Frank went from 403 to 200 on the lab's own group page. Holding those
  // datasets in `lab` therefore deletes the boundary the refusal specs assert, silently and
  // from another file. `requestLab` absorbs that widening, and `lab` stays a group the
  // sibling branch cannot see at all.
  { key: 'requestLab', parent: 'center', suffix: 'request-lab', type: 'lab' },
]);

/**
 * Datasets, named by the group that owns them. `labPrimary` is the dataset every access
 * flow is about; `siblingOwned` proves refusals run in both directions.
 */
/**
 * Datasets the sibling lab can see the metadata of and cannot read — one per request flow.
 *
 * They are separate rather than shared because the API refuses a second pending request for
 * an access type the requester has already asked for, and refuses a redundant one for access
 * already held. Both refusals are correct, and both would make one flow's leftovers decide
 * whether the next flow can even begin. A dataset each keeps every request test independent
 * of the order the others ran in.
 */
const LOCKED_DATASET_KEYS = Object.freeze([
  'lockedForApproval',
  'lockedForRejection',
  'lockedForRevocation',
  'lockedForHistoryA',
  'lockedForHistoryB',
  'lockedForWithdrawal',
]);

const DATASETS = Object.freeze([
  { key: 'labPrimary', group: 'lab', suffix: 'lab-primary', type: 'RAW_DATA' },
  { key: 'labSecondary', group: 'lab', suffix: 'lab-secondary', type: 'RAW_DATA' },
  { key: 'siblingOwned', group: 'siblingLab', suffix: 'sibling-owned', type: 'RAW_DATA' },
  ...LOCKED_DATASET_KEYS.map((key) => ({
    key,
    group: 'requestLab',
    suffix: key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
    type: 'RAW_DATA',
  })),
]);

const COLLECTIONS = Object.freeze([
  { key: 'labRelease', group: 'lab', suffix: 'lab-release', datasets: ['labPrimary', 'labSecondary'] },
]);

/**
 * Grants the world is built holding, beyond the one each dataset seeds for its owning group.
 *
 * Every `lockedFor*` dataset is made *discoverable and locked* to the sibling lab: its
 * metadata is visible, its files are not. The request flows need that state before they can
 * begin — G1 opens with "Frank can see PCM230203's metadata and cannot read its files", and
 * asking for access to something wholly invisible is a different flow (G3, which refuses).
 *
 * They all belong to `requestLab` rather than to `lab`, because a grant on a dataset also
 * makes its owning group visible. Pointing one of these at a `lab` dataset took Frank from
 * 403 to 200 on the lab's own group page and broke a refusal spec in another file.
 */
const EXTRA_GRANTS = Object.freeze([
  ...LOCKED_DATASET_KEYS.map((dataset) => ({
    key: `siblingSees-${dataset}`,
    dataset,
    subjectGroup: 'siblingLab',
    accessType: 'DATASET:VIEW_METADATA',
  })),
]);

module.exports = {
  FIXED_ACCOUNTS,
  ASSIGNED_CAST,
  HIERARCHY,
  DATASETS,
  COLLECTIONS,
  EXTRA_GRANTS,
  EXTRA_STANDING,
  LOCKED_DATASET_KEYS,
};
