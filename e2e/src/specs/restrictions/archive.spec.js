const { test, expect } = require('../../fixtures');
const { expectForbidden, expectNotForbidden } = require('../../assertions/parity');

/**
 * Phase 6 — restrictions and oversight.
 *
 * Archiving is the restriction the system actually ships, and it is the one place where a
 * platform admin is *not* the most powerful caller: a restriction composes by AND with every
 * policy, so it binds Priya exactly as it binds Alice. Unarchive is the single exception, and
 * it belongs to Priya alone.
 *
 * Every test archives something, which cannot be undone within the test without using the
 * very control under test, so each builds its own group.
 *
 * @see docs/design/groups/e2e-test-flows.md — A1, A3, A4, A5, K1, K2
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND
 */

/**
 * A group under one the creator already administers.
 *
 * The parent matters: `POST /groups/:id/children` authorizes against the *parent*, so Alice
 * cannot create under the centre — Dana administers that. `requestLab` is the group Alice
 * governs, and archiving a child of it leaves it untouched.
 */
async function createGroup(creator, world, label, parentKey = 'requestLab') {
  return creator.api.post(`/groups/${world.groups[parentKey].id}/children`, {
    name: `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`,
    description: `Phase 6 fixture for ${label}.`,
    admins: [world.people.alice.subject_id],
    members: [world.people.bob.subject_id],
  });
}

async function createDatasetIn(ctx, world, group, label) {
  const name = `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
  await ctx.api.post('/v2/datasets', {
    name,
    type: 'RAW_DATA',
    owner_group_id: group.id,
    origin_path: `/tmp/${world.prefix}/${label}`,
    description: `Phase 6 fixture for ${label}.`,
  });
  const found = await ctx.api.get(`/v2/datasets?name=${encodeURIComponent(name)}`);
  expect(found.data.length, `the dataset ${name} could not be read back`).toBe(1);
  return found.data[0];
}

/** The mutations a restriction must refuse. Each is governance, not reading. */
function mutationsOn(world, group) {
  return [
    ['POST', `/groups/${group.id}/members`, { members: [{ user_id: world.people.quinn.subject_id }] }],
    ['POST', `/groups/${group.id}/invitations`, { email: `frozen-${Date.now()}@example.org`, role: 'MEMBER' }],
    ['PATCH', `/groups/${group.id}`, { version: 1, description: 'edited while frozen' }],
  ];
}

test('A1 — a centre admin creates a child and it appears with its named admin', async ({ world, as }) => {
  const [dana, alice] = await Promise.all([as('dana'), as('alice')]);
  const child = await createGroup(dana, world, 'a1-child', 'center');

  // Dana administers the centre above it, so she reads it and its members.
  await expectNotForbidden(dana.api, 'GET', `/groups/${child.id}`);
  await expectNotForbidden(dana.api, 'GET', `/groups/${child.id}/members`);

  // Alice is its first admin and appears as one.
  const members = await dana.api.get(`/groups/${child.id}/members?membership_type=direct`);
  const rows = members.data || members.members || members;
  const aliceRow = rows.find((m) => (m.user_id || m.subject_id || m.user?.subject_id)
    === world.people.alice.subject_id);
  expect(aliceRow, 'the named first admin is not in the group').toBeTruthy();
  expect(aliceRow.role).toBe('ADMIN');

  // And Dana is not in it at all. She named Alice and not herself, so she governs nothing here.
  const danaRow = rows.find((m) => (m.user_id || m.subject_id || m.user?.subject_id)
    === world.people.dana.subject_id);
  expect(danaRow, 'the creator was added to the child she created').toBeFalsy();

  // Which is why naming nobody is refused rather than quietly making the creator the admin.
  // 400, not 403: Dana is allowed to create the group, the request is the thing at fault.
  const refused = await dana.api.raw('POST', `/groups/${world.groups.center.id}/children`, {
    name: `${world.prefix}-a1-ungoverned-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Phase 6 fixture: the child nobody would govern.',
    admins: [],
    members: [],
  });
  expect(refused.status, 'a child group with no admin was accepted').toBe(400);
  expect(refused.body, 'the refusal does not say an admin is needed').toMatch(/admin/i);
});

/**
 * A1's second half: the separation between oversight and authority, at the one place it used to
 * leak.
 *
 * The flow says "never does Dana gain the ability to issue or revoke a grant on anything Wong
 * Lab owns. Creating a child confers oversight, not authority." `POST /groups/:id/children`
 * used to disagree, appending a non-platform-admin creator to the child's `admins`, so whoever
 * made a group governed it for good. It no longer does, and the request has to name an admin
 * instead. This spec carried the disagreement as a `test.fail()` until then.
 *
 * @see .todo/local/L1-authorization-enforcement.md — T11
 */
test('A1 — creating a child confers oversight, not authority', async ({ world, as }) => {
  const [dana, alice] = await Promise.all([as('dana'), as('alice')]);
  const child = await createGroup(dana, world, 'a1-authority', 'center');
  const dataset = await createDatasetIn(alice, world, child, 'a1-dataset');

  await expectForbidden(dana.api, 'POST', '/grants', {
    subject_id: world.groups.siblingLab.id,
    resource_type: 'DATASET',
    resource_id: dataset.resource_id,
    justification: 'A1: an ancestor admin must not be able to issue this.',
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      approved_expiry: { type: 'never', value: null },
    }],
  });
});

test('A3 — archiving freezes a group without erasing it', async ({ world, as }) => {
  const [priya, alice, bob] = await Promise.all([as('priya'), as('alice'), as('bob')]);
  const group = await createGroup(alice, world, 'a3-group');
  const dataset = await createDatasetIn(alice, world, group, 'a3-dataset');

  await expectNotForbidden(bob.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  await alice.api.post(`/groups/${group.id}/archive`, {});

  const archived = await alice.api.get(`/groups/${group.id}`);
  expect(archived.is_archived, 'the group does not read as archived').toBe(true);

  // Existing grants survive. Archiving freezes governance; it does not withdraw access that
  // was already given, which is what makes it different from deletion.
  await expectNotForbidden(bob.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  // K2: every read still works for whoever could read it before.
  for (const path of ['', '/members', '/audit', '/invitations']) {
    // eslint-disable-next-line no-await-in-loop
    await expectNotForbidden(alice.api, 'GET', `/groups/${group.id}${path}`);
  }

  // And never a mutation, for the group's own admin.
  for (const [method, url, body] of mutationsOn(world, group)) {
    // eslint-disable-next-line no-await-in-loop
    await expectForbidden(alice.api, method, url, body);
  }

  // K1: the restriction outranks a platform admin. This is the assertion that makes
  // archiving a restriction rather than a permission — Priya is refused the same mutations.
  for (const [method, url, body] of mutationsOn(world, group)) {
    // eslint-disable-next-line no-await-in-loop
    await expectForbidden(priya.api, method, url, body);
  }

  // With unarchive as the sole exception, and it is Priya's alone.
  await expectNotForbidden(priya.api, 'POST', `/groups/${group.id}/unarchive`, {});
});

test('A4 — archiving reaches descendants and their resources', async ({ world, as }) => {
  const alice = await as('alice');
  const parent = await createGroup(alice, world, 'a4-parent');
  const child = await alice.api.post(`/groups/${parent.id}/children`, {
    name: `${world.prefix}-a4-child-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Phase 6 fixture: the descendant that freezes with its ancestor.',
    admins: [world.people.alice.subject_id],
    members: [],
  });
  const childDataset = await createDatasetIn(alice, world, child, 'a4-dataset');

  // The child is not archived in its own right.
  await alice.api.post(`/groups/${parent.id}/archive`, {});
  const childAfter = await alice.api.get(`/groups/${child.id}`);
  expect(childAfter.is_archived, 'the child was archived in its own right rather than by its ancestor')
    .toBe(false);

  // And yet it is frozen, because the restriction propagates down. The distinction matters:
  // the child says it is not archived, and still refuses every mutation.
  for (const [method, url, body] of mutationsOn(world, child)) {
    // eslint-disable-next-line no-await-in-loop
    await expectForbidden(alice.api, method, url, body);
  }

  // Its resources are frozen too — a dataset owned by a frozen group cannot gain grants.
  await expectForbidden(alice.api, 'POST', '/grants', {
    subject_id: world.groups.siblingLab.id,
    resource_type: 'DATASET',
    resource_id: childDataset.resource_id,
    justification: 'A4: the resource of a descendant of an archived group.',
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      approved_expiry: { type: 'never', value: null },
    }],
  });

  // Reading it still works.
  await expectNotForbidden(alice.api, 'GET', `/v2/datasets/${childDataset.resource_id}`);
});

test('A5 — a group admin cannot unarchive their own group', async ({ world, as }) => {
  const [priya, alice] = await Promise.all([as('priya'), as('alice')]);
  const group = await createGroup(alice, world, 'a5-group');

  await alice.api.post(`/groups/${group.id}/archive`, {});

  // The plan expected this to fail: the unarchive route was authorized with `'group',
  // 'archive'`, so its own admin could reactivate the authority a platform admin suspended.
  // It now binds `'group', 'unarchive'`, and the refusal below is real. `use-cases.md` still
  // describes the hole as open.
  await expectForbidden(alice.api, 'POST', `/groups/${group.id}/unarchive`, {});

  // Still archived afterwards — the refusal did not half-apply.
  const after = await priya.api.get(`/groups/${group.id}`);
  expect(after.is_archived).toBe(true);

  // And Priya can, which is what makes the refusal above about authority rather than about
  // the route being broken.
  await expectNotForbidden(priya.api, 'POST', `/groups/${group.id}/unarchive`, {});
});
