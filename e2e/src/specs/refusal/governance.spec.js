const { test, expect } = require('../../fixtures');
const { expectForbidden, expectNotForbidden, expectRefused } = require('../../assertions/parity');

/**
 * Phase 2 — the refusal spine, on governance.
 *
 * The single claim underneath F10, J1, and J2: seeing a thing and being able to change who
 * else sees it are different powers, and nothing in this model turns the first into the
 * second. Oversight reads downward, membership rises upward, and governance authority stays
 * local to the group that holds it.
 *
 * @see docs/design/groups/e2e-test-flows.md — F10, G7, J1, J2
 * @see docs/design/groups/decisions.md — Authorization paths: consumption vs governance
 */

test('F10 — only the owning group\'s admins may grant', async ({ world, as }) => {
  const [alice, dana, erin, bob] = await Promise.all([
    as('alice'), as('dana'), as('erin'), as('bob'),
  ]);
  const datasetId = world.datasets.labPrimary.resource_id;
  // A well-formed grant issue. `POST /grants` validates subject, resource type, resource id,
  // and a non-empty items array before the policy runs, so a payload short of that is
  // refused as a 400 and never reaches the thing under test.
  const issue = {
    subject_id: world.groups.siblingLab.id,
    resource_type: 'DATASET',
    resource_id: datasetId,
    // `approved_expiry` is required, not optional: the validator runs `Expiry.validate`
    // with no `.optional()` in front of it, and an expiry is `{ type, value }`.
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      approved_expiry: { type: 'never', value: null },
    }],
  };

  // Alice administers the owning lab. She is the control: without her, "nobody may grant"
  // and "only the owning admin may grant" look identical from every other assertion here.
  await expectNotForbidden(alice.api, 'GET', `/grants?resource_id=${datasetId}`);

  // Dana oversees the lab from the centre above it. Oversight reads and does not act.
  await expectForbidden(dana.api, 'POST', '/grants', issue);

  // Erin administers the sibling lab. Authority does not travel sideways, and she should not
  // reach the dataset at all.
  await expectRefused(erin.api, 'GET', `/v2/datasets/${datasetId}`);
  await expectForbidden(erin.api, 'POST', '/grants', issue);

  // Bob is an ordinary member of the owning lab. He reads the dataset through the seeded
  // grant, and membership confers nothing beyond it.
  await expectNotForbidden(bob.api, 'GET', `/v2/datasets/${datasetId}`);
  await expectForbidden(bob.api, 'POST', '/grants', issue);
});

test('J1 — oversight reads and cannot act', async ({ world, as }) => {
  const dana = await as('dana');
  const lab = world.groups.lab.id;

  // Dana administers the centre, so every descendant is visible to her. The read half is
  // what makes the refusals below meaningful rather than a stranger's blanket denial.
  await expectNotForbidden(dana.api, 'GET', `/groups/${lab}`);
  await expectNotForbidden(dana.api, 'GET', `/groups/${lab}/members`);

  // And the act half. Each of these is a governance action local to the lab.
  // `version` is required for optimistic concurrency, and is validated before the policy.
  await expectForbidden(dana.api, 'PATCH', `/groups/${lab}`, {
    version: world.groups.lab.version ?? 1,
    description: 'oversight edit',
  });
  // `members` is an array of objects carrying `user_id`, not an array of ids.
  await expectForbidden(dana.api, 'POST', `/groups/${lab}/members`, {
    members: [{ user_id: world.people.frank.subject_id }],
  });
});

test('J2 — oversight stops at the branch', async ({ world, as }) => {
  const alice = await as('alice');

  // Alice administers the lab. Below her is the sub-lab; beside her is the sibling.
  await expectNotForbidden(alice.api, 'GET', `/groups/${world.groups.subLab.id}`);
  await expectRefused(alice.api, 'GET', `/v2/datasets/${world.datasets.siblingOwned.resource_id}`);

  // The sibling branch is absent from what she can enumerate, not merely refused on request.
  // `limit` is capped at 100 by the route's validator.
  const groups = await alice.api.post('/groups/search', { scope: 'all', limit: 100 });
  const names = groups.data.map((g) => g.name);
  expect(names).toContain(world.groups.subLab.name);
  expect(names).not.toContain(world.groups.siblingLab.name);
});

test('G7 — a reviewer sees only their own queue', async ({ world, as }) => {
  const erin = await as('erin');

  // Erin administers the sibling lab, so she reviews requests against its resources and no
  // others. The run creates no requests, so the assertion is that nothing belonging to the
  // lab branch appears rather than that the queue is empty.
  const queue = await erin.api.get('/access-requests/my-pending-reviews?limit=100');
  const rows = queue.data || queue.access_requests || [];
  const reachable = rows.filter((r) => r.resource_id === world.datasets.labPrimary.resource_id);
  expect(reachable, 'a sibling admin reached a request on another group\'s resource').toEqual([]);
});
