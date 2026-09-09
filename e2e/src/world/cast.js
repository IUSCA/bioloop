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
]);

/**
 * Datasets, named by the group that owns them. `labPrimary` is the dataset every access
 * flow is about; `siblingOwned` proves refusals run in both directions.
 */
const DATASETS = Object.freeze([
  { key: 'labPrimary', group: 'lab', suffix: 'lab-primary', type: 'RAW_DATA' },
  { key: 'labSecondary', group: 'lab', suffix: 'lab-secondary', type: 'RAW_DATA' },
  { key: 'siblingOwned', group: 'siblingLab', suffix: 'sibling-owned', type: 'RAW_DATA' },
]);

const COLLECTIONS = Object.freeze([
  { key: 'labRelease', group: 'lab', suffix: 'lab-release', datasets: ['labPrimary', 'labSecondary'] },
]);

module.exports = {
  FIXED_ACCOUNTS, ASSIGNED_CAST, HIERARCHY, DATASETS, COLLECTIONS,
};
