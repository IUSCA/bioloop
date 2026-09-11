const { test, expect } = require('../../fixtures');
const { expectForbidden, expectNotForbidden } = require('../../assertions/parity');

/**
 * Phase 5a — membership.
 *
 * What joining a group changes, what leaving it changes, and what a member is allowed to see
 * about the group itself. Membership rises through the hierarchy and governance does not,
 * which B1 asserts from the inside: a new admin of a lab gains the lab and nothing above it.
 *
 * Every test builds its own group, because membership is the thing under test and a worker's
 * world is shared by every spec file it runs. Adding Frank to `lab` here would quietly delete
 * the premise of a refusal spec in another file, and whichever ran second would fail.
 *
 * @see docs/design/groups/e2e-test-flows.md — B1, B2, B4, B5
 */

/** A fresh group under the run's centre, named so teardown collects it. */
async function createGroup(priya, world, label, parentKey = 'center') {
  const name = `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
  return priya.api.post(`/groups/${world.groups[parentKey].id}/children`, {
    name,
    description: `Phase 5 fixture for ${label}.`,
    admins: [world.people.alice.subject_id],
    members: [],
  });
}

/** A dataset owned by a group created in the test. */
async function createDatasetIn(ctx, world, group, label) {
  const name = `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
  await ctx.api.post('/v2/datasets', {
    name,
    type: 'RAW_DATA',
    owner_group_id: group.id,
    origin_path: `/tmp/${world.prefix}/${label}`,
    description: `Phase 5 fixture for ${label}.`,
  });
  const found = await ctx.api.get(`/v2/datasets?name=${encodeURIComponent(name)}`);
  expect(found.data.length, `the dataset ${name} could not be read back`).toBe(1);
  return found.data[0];
}

test('B1 — adding a member changes what they reach, and promoting stops at the group', async ({ world, as }) => {
  const [priya, alice, frank] = await Promise.all([as('priya'), as('alice'), as('frank')]);
  const lab = await createGroup(priya, world, 'b1-lab');
  const child = await priya.api.post(`/groups/${lab.id}/children`, {
    name: `${world.prefix}-b1-sub-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Phase 5 fixture: the group a new admin gains oversight of.',
    admins: [],
    members: [],
  });
  const dataset = await createDatasetIn(alice, world, lab, 'b1-dataset');

  // Before: Frank belongs to the sibling branch and reaches none of it.
  await expectForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  await alice.api.post(`/groups/${lab.id}/members`, {
    members: [{ user_id: world.people.frank.subject_id }],
  });

  // Membership brings the owning-group grant with it, so the dataset arrives.
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  // A member and not yet a governor: he cannot add anybody else.
  await expectForbidden(frank.api, 'POST', `/groups/${lab.id}/members`, {
    members: [{ user_id: world.people.quinn.subject_id }],
  });

  // Promotion is a PUT on the admins collection; POST is not a route there and answers 404,
  // which any assertion phrased as "refused" would have accepted.
  await alice.api.put(`/groups/${lab.id}/admins/${world.people.frank.subject_id}`, {});

  // Now he governs this group, and the one beneath it.
  await expectNotForbidden(frank.api, 'POST', `/groups/${lab.id}/members`, {
    members: [{ user_id: world.people.quinn.subject_id }],
  });
  await expectNotForbidden(frank.api, 'GET', `/groups/${child.id}`);

  // And never the group above. Authority is local; oversight only ever points downward.
  await expectForbidden(frank.api, 'PATCH', `/groups/${world.groups.center.id}`, {
    version: 1,
    description: 'B1: a new lab admin must not be able to edit the centre.',
  });
});

test('B2 — removing a member removes their access and keeps the record', async ({ world, as }) => {
  const [priya, alice, frank] = await Promise.all([as('priya'), as('alice'), as('frank')]);
  const lab = await createGroup(priya, world, 'b2-lab');
  const dataset = await createDatasetIn(alice, world, lab, 'b2-dataset');

  await alice.api.post(`/groups/${lab.id}/members`, {
    members: [{ user_id: world.people.frank.subject_id }],
  });
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  await alice.api.del(`/groups/${lab.id}/members/${world.people.frank.subject_id}`);

  // The access goes with the membership, on the direct route as well as in the listing.
  await expectForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
  const listed = await frank.api.get(`/v2/datasets?name=${encodeURIComponent(dataset.name)}`);
  expect(listed.data.map((d) => d.name)).not.toContain(dataset.name);

  // Frank is not in the member list any more, which is correct: a removed member is not a
  // member. The record lives in the group's audit log instead, and that is the surface a page
  // showing "who was a member, and when they stopped" has to read.
  const current = await alice.api.get(`/groups/${lab.id}/members?membership_type=all`);
  const currentRows = current.data || current.members || current;
  expect(JSON.stringify(currentRows)).not.toContain(world.people.frank.subject_id);

  const audit = await alice.api.get(`/groups/${lab.id}/audit`);
  const events = (audit.data || audit.records || audit)
    .filter((e) => e.subject_id === world.people.frank.subject_id)
    .map((e) => e.event_type || e.action);

  // Both halves of the story, not just the ending. A log that recorded only the removal could
  // not answer when Frank had become a member in the first place.
  expect(events, 'the group audit log lost the fact that Frank was ever a member')
    .toContain('GROUP_MEMBER_ADDED');
  expect(events, 'the group audit log lost the removal')
    .toContain('GROUP_MEMBER_REMOVED');

  // And the membership row is closed rather than deleted, which is what lets the log above be
  // reconstructed and what `removed_at` exists for.
  const removal = (audit.data || audit.records || audit)
    .find((e) => (e.event_type || e.action) === 'GROUP_MEMBER_REMOVED');
  expect(removal.timestamp || removal.created_at, 'the removal carries no date').toBeTruthy();
});

test('B4 — a member sees the group, not its governance', async ({ world, as }) => {
  const bob = await as('bob');
  const lab = world.groups.lab.id;

  // What a member may see: the group itself and who else is in it.
  await expectNotForbidden(bob.api, 'GET', `/groups/${lab}`);
  await expectNotForbidden(bob.api, 'GET', `/groups/${lab}/members`);

  // What a member may not: the grants issued to the group, the grants on its resources, and
  // the audit log. These are governance, and membership is not governance.
  await expectForbidden(bob.api, 'GET', `/grants/subject/GROUP/${lab}`);
  await expectForbidden(
    bob.api,
    'GET',
    `/grants/resource/DATASET/${world.datasets.labPrimary.resource_id}`,
  );
  await expectForbidden(bob.api, 'GET', `/groups/${lab}/audit`);
});

test('B5 — transitive and direct members see the same group page', async ({ world, as }) => {
  const [bob, carol] = await Promise.all([as('bob'), as('carol')]);
  const centre = world.groups.center.id;

  // Bob reaches the centre through the lab; Carol through the sub-lab beneath it. Neither is
  // a direct member. There is no tiered visibility based on the path membership took.
  const bobView = await bob.api.get(`/groups/${centre}`);
  const carolView = await carol.api.get(`/groups/${centre}`);

  expect(Object.keys(carolView).sort()).toEqual(Object.keys(bobView).sort());

  // Field for field, excluding anything the server computes about the caller rather than
  // about the group — those are *supposed* to differ, and comparing them would assert that
  // two different people are the same person.
  const CALLER_SPECIFIC = ['_meta', 'my_role', 'membership_type'];
  for (const key of Object.keys(bobView)) {
    if (CALLER_SPECIFIC.includes(key)) continue;
    expect(carolView[key], `the group's '${key}' differs by how membership was reached`)
      .toEqual(bobView[key]);
  }
});
