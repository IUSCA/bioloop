const { test, expect } = require('../../fixtures');
const { expectForbidden, expectNotForbidden } = require('../../assertions/parity');

/**
 * Phase 2 — the refusal spine, on discovery.
 *
 * Where the other two files ask whether a caller may open a thing, these ask whether they can
 * learn it exists. A refusal that names what it is refusing has already leaked, so several of
 * these assert the shape of an answer rather than its status.
 *
 * @see docs/design/groups/e2e-test-flows.md — H4, L2, E2, G3
 */

test('H4 — searching for the exact name returns nothing, and says nothing', async ({ world, as }) => {
  const [frank, bob] = await Promise.all([as('frank'), as('bob')]);
  const name = world.datasets.labPrimary.name;

  // Bob is the control. Searching an exact name that matches nothing looks identical to
  // searching one the caller may not see, so without him this asserts only that search works.
  const found = await bob.api.get(`/v2/datasets?name=${encodeURIComponent(name)}&limit=10`);
  expect(found.data.map((d) => d.name)).toContain(name);

  const hidden = await frank.api.get(`/v2/datasets?name=${encodeURIComponent(name)}&limit=10`);
  expect(hidden.data.map((d) => d.name)).not.toContain(name);
  // The total is zero rather than "one, hidden". A count that included what it would not show
  // answers the question the search was refused for.
  expect(hidden.metadata.total).toBe(0);
});

test('L2 — the audit stream is not public', async ({ as }) => {
  const [frank, bob, quinn, priya] = await Promise.all([
    as('frank'), as('bob'), as('quinn'), as('priya'),
  ]);

  for (const person of [frank, bob, quinn]) {
    // eslint-disable-next-line no-await-in-loop
    await expectForbidden(person.api, 'GET', '/audit/records?limit=10');
  }

  // Somebody must be able to read it, or the refusals above would hold on a route that was
  // simply broken.
  await expectNotForbidden(priya.api, 'GET', '/audit/records?limit=10');
});

test('the group page refuses without naming what it is refusing', async ({ world, as }) => {
  // The group page used to render "Failed to load group. Request failed with status code
  // 403": an outage to look at, and a confirmation that the group is there. Both halves are
  // asserted here, because removing only the status code would still read as a breakage.
  const frank = await as('frank');
  await frank.page.goto(`/v2/groups/${world.groups.lab.id}`);

  const state = frank.page.getByTestId('error-state');
  await expect(state).toBeVisible();
  await expect(state).toContainText(/do not have access/i);
  await expect(state).not.toContainText(/Request failed with status code/i);

  // The group's name is the thing a refusal must not hand over.
  await expect(frank.page.getByText(world.groups.lab.name, { exact: false }))
    .toHaveCount(0);
});

test('E2 — a collection holds only its own group\'s datasets', async ({ world, as }) => {
  const alice = await as('alice');
  const collectionId = world.collections.labRelease.id;

  // The refusal here is a 400, not a 403, and the difference is real rather than sloppy: the
  // caller is a legitimate admin of this collection, so nothing about *her* is being refused.
  // What is rejected is the request itself, as a dataset the owning group does not own. So
  // this asserts the outcome — the dataset is not in the collection — rather than a status,
  // which is the claim the flow actually makes.
  const status = await alice.api.status('POST', `/collections/${collectionId}/datasets`, {
    dataset_ids: [world.datasets.siblingOwned.resource_id],
  });
  expect(status, 'a cross-group dataset was accepted into the collection').toBeGreaterThanOrEqual(400);

  const contents = await alice.api.get(`/collections/${collectionId}/datasets?limit=100`);
  const names = (contents.data || contents).map((d) => d.name);
  expect(names, 'the sibling group\'s dataset reached the collection')
    .not.toContain(world.datasets.siblingOwned.name);
  // The paired positive half: the collection did render its own group's datasets, so the
  // absence above is not an empty answer from a call that failed.
  expect(names).toContain(world.datasets.labPrimary.name);
});

/**
 * G3 was written as an expected failure and passed on its first run, which is how this suite
 * learned the hole is closed.
 *
 * The gap recorded in `.todo/local/L1-authorization-enforcement.md` T2 was that
 * `authorize('access_request', 'create')` is `Policy.always` and the service validated only
 * the request's *subject*, so anyone holding a resource UUID could file against a resource
 * invisible to them — and the reply confirmed the resource was real. Measured here: a
 * stranger's request against the lab's dataset is refused 403.
 */
test('G3 — a request against an invisible resource is refused', async ({ world, as }) => {
  const frank = await as('frank');

  await expectForbidden(frank.api, 'POST', '/access-requests', {
    type: 'NEW',
    resource_id: world.datasets.labPrimary.resource_id,
    subject_id: world.people.frank.subject_id,
    purpose: 'End-to-end check that an invisible resource cannot be requested.',
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      requested_expiry: { type: 'never', value: null },
    }],
  });
});
