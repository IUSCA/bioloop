const { test, expect } = require('../../fixtures');
const {
  expectAllowed, expectConflict, expectForbidden, expectNotForbidden,
} = require('../../assertions/parity');

/**
 * Archiving, and the oversight boundary around it.
 *
 * Archiving is the group's own state, not a permission and not a restriction that composes with
 * the policies. It is checked after authorization, inside the transaction that would perform the
 * write, so a refusal is 409 and not 403: an archived group's admin keeps every capability they
 * had, and telling them otherwise would be false. A platform admin is refused identically,
 * because there is no authority to outrank — the group is simply not taking changes. Unarchive is
 * the exception, and it belongs to a platform admin alone.
 *
 * Archiving covers the group and what it owns, one step. A sub-group keeps its own state until
 * somebody archives it, which A4 is the test of.
 *
 * Every test archives something, which cannot be undone within the test without using the
 * very control under test, so each builds its own group.
 *
 * @see docs/design/groups/e2e-test-flows.md — A1, A3, A4, A5, K1, K2
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
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

  // And never a mutation, for the group's own admin — 409, not 403. Alice still holds
  // `add_member`, `invite`, and `edit_metadata` here; the group is what declines them.
  for (const [method, url, body] of mutationsOn(world, group)) {
    // eslint-disable-next-line no-await-in-loop
    await expectConflict(alice.api, method, url, body);
  }

  // K1: a platform admin is refused the same way, and this is the assertion that makes
  // archiving the group's state rather than a permission. Priya is not being outranked by a
  // restriction — she is being told the group is not taking changes.
  for (const [method, url, body] of mutationsOn(world, group)) {
    // eslint-disable-next-line no-await-in-loop
    await expectConflict(priya.api, method, url, body);
  }

  // With unarchive as the sole exception, and it is Priya's alone.
  await expectNotForbidden(priya.api, 'POST', `/groups/${group.id}/unarchive`, {});
});

test('A4 — archiving covers the group and what it owns, not its sub-groups', async ({ world, as }) => {
  const alice = await as('alice');
  const parent = await createGroup(alice, world, 'a4-parent');
  const child = await alice.api.post(`/groups/${parent.id}/children`, {
    name: `${world.prefix}-a4-child-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Phase 6 fixture: the sub-group that keeps its own state.',
    admins: [world.people.alice.subject_id],
    members: [],
  });
  const parentDataset = await createDatasetIn(alice, world, parent, 'a4-parent-dataset');
  const childDataset = await createDatasetIn(alice, world, child, 'a4-child-dataset');

  await alice.api.post(`/groups/${parent.id}/archive`, {});

  // The sub-group is untouched, and says so: archiving writes one column on one group.
  const childAfter = await alice.api.get(`/groups/${child.id}`);
  expect(childAfter.is_archived, 'the sub-group reports its ancestor\'s archive as its own')
    .toBe(false);
  expect(
    childAfter._meta.available_actions,
    'the sub-group withholds a mutating action although its own state admits it',
  ).toContain('add_member');

  // And its mutating controls work.
  //
  // Deliberately not `mutationsOn`, which adds Quinn. Every other use of that helper asserts a
  // refusal, so nothing is written; asserting it *allowed* would really put Quinn in this group,
  // and membership rises through the hierarchy, making him a transitive member of every ancestor.
  // Quinn is the suite's zero-access sentinel — `harness.spec.js` asserts he reaches none of the
  // run's resources — so that one success deletes another file's premise, and whichever ran
  // second failed. Measured: it did, in the first full run after this test was inverted.
  //
  // These two write nothing that outlives the test. An invitation is an offer and confers no
  // access until somebody accepts it, and the PATCH consumes the version it sends, so it is sent
  // once.
  await expectAllowed(alice.api, 'PATCH', `/groups/${child.id}`, {
    version: 1,
    description: 'A4: edited while the ancestor is archived.',
  });
  await expectAllowed(alice.api, 'POST', `/groups/${child.id}/invitations`, {
    email: `a4-active-${Date.now()}@example.org`,
    role: 'MEMBER',
  });

  // What the parent owns freezes with it. The refusal names the owning group, because the
  // dataset itself is not archived — it has no such state of its own.
  const refusedGrant = await alice.api.raw('POST', '/grants', {
    subject_id: world.groups.siblingLab.id,
    resource_type: 'DATASET',
    resource_id: parentDataset.resource_id,
    justification: 'A4: a dataset owned by the archived group.',
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      approved_expiry: { type: 'never', value: null },
    }],
  });
  expect(refusedGrant.status, 'a grant on the archived group\'s dataset was not a conflict')
    .toBe(409);
  expect(
    JSON.stringify(refusedGrant.body),
    'the refusal does not say the owning group is archived',
    // Deliberately the whole word rather than a truncated prefix. Every refusal in
    // `api/src/state/builtin/` says "archived" in full — this one comes from the dataset
    // container, which sends "This dataset's owning group is archived" — and a prefix would
    // also be satisfied by an unrelated sentence about the SDA tape archive.
  ).toMatch(/archived/i);

  // While the sub-group's own dataset takes one, which is what makes the refusal above about
  // the parent's state rather than about grants being broken.
  await expectAllowed(alice.api, 'POST', '/grants', {
    subject_id: world.groups.siblingLab.id,
    resource_type: 'DATASET',
    resource_id: childDataset.resource_id,
    justification: 'A4: a dataset owned by the sub-group, which is active.',
    items: [{
      access_type_id: world.accessTypes['DATASET:VIEW_METADATA'],
      approved_expiry: { type: 'never', value: null },
    }],
  });

  // Reading the frozen group's dataset still works. Archiving closes governance and leaves the
  // bytes and the metadata readable.
  await expectNotForbidden(alice.api, 'GET', `/v2/datasets/${parentDataset.resource_id}`);
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
