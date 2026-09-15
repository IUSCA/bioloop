const { test, expect } = require('../fixtures');
const { expectRefused, expectAllowed } = require('../assertions/parity');

/**
 * Phase 1 — the harness.
 *
 * Proves the three things every later spec rests on: a world gets built, a person signs in
 * as themselves rather than as a platform admin, and the API agrees with the page about who
 * may reach what. It is not a flow from the flows page; it is the floor those flows stand on.
 *
 * @see docs/design/groups/implementation/e2e-test-plan.md — Phase 1
 */

test('the world is built, and its shape is what the flows assume', async ({ world }) => {
  expect(Object.keys(world.groups)).toEqual(
    expect.arrayContaining(['center', 'lab', 'subLab', 'siblingLab']),
  );
  expect(world.groups.lab.name).toBe(`${world.prefix}-lab`);

  // Every dataset is owned, which is use case 59 and the constraint the v2 create route
  // enforces. A dataset with no owning group falls outside the authorization model.
  for (const dataset of Object.values(world.datasets)) {
    expect(dataset.owner_group_id).toBeTruthy();
  }
  expect(world.datasets.labPrimary.owner_group_id).toBe(world.groups.lab.id);
  expect(world.datasets.siblingOwned.owner_group_id).toBe(world.groups.siblingLab.id);

  // No two people share an account. The borrowed pool is chosen by a query, so a person can
  // silently become another: lending Quinn's account to Dana makes the zero-access user a
  // centre admin, and every refusal Quinn exists to demonstrate then reads as an allow. The
  // spec that noticed reported it as a wrong persona, which names the symptom, not this.
  const usernames = Object.values(world.people).map((p) => p.username);
  expect(new Set(usernames).size).toBe(usernames.length);
});

test('a group admin signs in as themselves, not as a platform admin', async ({ as }) => {
  const alice = await as('alice');

  // `/v2/users/me` answers `{ user, is_platform_admin, admin_group_count, oversight_group_count }`.
  // The profile is nested, and the three facts are the server's answer to "what kind of caller is this".
  const me = await alice.api.get('/v2/users/me');
  expect(me.user.username).toBe(alice.person.username);

  // The engine allows a platform admin every action before any policy runs, so a suite
  // driven as one exercises nothing. Alice must not be one.
  expect(me.user.roles || []).not.toContain('admin');
  expect(me.is_platform_admin).toBe(false);
  expect(me.admin_group_count).toBeGreaterThan(0);
});

test('the zero-access user reaches none of this run\'s resources', async ({ world, as }) => {
  const quinn = await as('quinn');

  const me = await quinn.api.get('/v2/users/me');
  expect(me.is_platform_admin).toBe(false);
  expect(me.admin_group_count).toBe(0);
  expect(me.oversight_group_count).toBe(0);

  // Scoped to this run's own dataset rather than to an empty listing. The seed grants both
  // system principals access to seeded datasets on purpose, so "sees nothing at all" is not
  // true of a seeded database and asserting it would fail for the wrong reason.
  await expectRefused(quinn.api, 'GET', `/v2/datasets/${world.datasets.labPrimary.resource_id}`);
});

test('the owning group can reach its dataset, and a sibling group cannot', async ({ world, as }) => {
  const [bob, frank] = await Promise.all([as('bob'), as('frank')]);
  const datasetId = world.datasets.labPrimary.resource_id;

  // Bob is an ordinary member of the owning group. He reads through the grant seeded with
  // the dataset, not through a rule — decision 12.
  await expectAllowed(bob.api, 'GET', `/v2/datasets/${datasetId}`);

  // Frank belongs to the sibling lab. Nothing connects him to this dataset.
  await expectRefused(frank.api, 'GET', `/v2/datasets/${datasetId}`);
});

test('membership rises through the hierarchy, and authority does not', async ({ world, as }) => {
  const [carol, alice] = await Promise.all([as('carol'), as('alice')]);

  // Carol is a direct member of the sub-lab only, and a transitive member above it.
  const carolGroups = await carol.api.post('/groups/search', { scope: 'all', limit: 100 });
  const carolNames = carolGroups.data.map((g) => g.name);
  expect(carolNames).toEqual(expect.arrayContaining([
    world.groups.subLab.name, world.groups.lab.name, world.groups.center.name,
  ]));

  // Alice administers the lab, so she governs its dataset.
  await expectAllowed(alice.api, 'GET', `/v2/datasets/${world.datasets.labPrimary.resource_id}`);

  // She administers nothing in the sibling branch, and oversight does not travel sideways.
  await expectRefused(alice.api, 'GET', `/v2/datasets/${world.datasets.siblingOwned.resource_id}`);
});
