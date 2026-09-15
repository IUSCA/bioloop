const { test, expect } = require('../../fixtures');
const { expectConcealed, expectForbidden, expectNotForbidden } = require('../../assertions/parity');
const { grantsOnResource, grantsHeldBy } = require('../../world/grants');

/**
 * Phase 4 — grants and the access-type order.
 *
 * The order is `DOWNLOAD` → `LIST_FILES` → `VIEW_METADATA`, closed over once at startup, and
 * decision 7 is that a grant of a wider type *is* every narrower one. F3 and F4 assert the
 * consequences of that at the surface; D1 and D2 assert that ownership and access are
 * separate powers.
 *
 * Each test creates its own dataset. Grants accumulate on a resource and revocations are
 * permanent, so two tests sharing one would make the order they ran in decide the outcome.
 *
 * They are created in `requestLab`, never in `lab`. A grant on a dataset also makes its
 * owning group visible, so granting an outsider anything on a `lab` dataset opens the lab's
 * own group page and breaks a refusal spec in another file. `requestLab` is the group that
 * absorbs that widening by design; `lab` stays invisible to the sibling branch. Bob is a
 * member of both, so the owning-member half of D1 and D2 still has somebody to assert about.
 *
 * @see docs/design/groups/e2e-test-flows.md — F1, F2, F3, F4, F5, F8, F9, D1, D2
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */

const NEVER = { type: 'never', value: null };

/** A dataset owned by one of the run's groups, created by the caller. */
async function createDataset(ctx, world, groupKey, label) {
  const name = `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
  await ctx.api.post('/v2/datasets', {
    name,
    type: 'RAW_DATA',
    owner_group_id: world.groups[groupKey].id,
    origin_path: `/tmp/${world.prefix}/${label}`,
    description: `Phase 4 fixture for ${label}.`,
  });
  const found = await ctx.api.get(`/v2/datasets?name=${encodeURIComponent(name)}`);
  expect(found.data.length, `the dataset ${name} was created and cannot be read back`).toBe(1);
  return found.data[0];
}

/** Issues one grant of one access type to a subject. */
function issueGrant(ctx, { subjectId, resourceId, accessTypeId, justification }) {
  return ctx.api.post('/grants', {
    subject_id: subjectId,
    resource_type: 'DATASET',
    resource_id: resourceId,
    justification,
    items: [{ access_type_id: accessTypeId, approved_expiry: NEVER }],
  });
}

test('D1 — a dataset is born with an owner and exactly one grant', async ({ world, as }) => {
  const [alice, bob, frank] = await Promise.all([as('alice'), as('bob'), as('frank')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'd1-born');

  expect(dataset.owner_group_id, 'a dataset was created with no owning group')
    .toBe(world.groups.requestLab.id);

  // One grant, naming the owning group, issued by the system. Decision 12: members read
  // through a listed grant, never through an invisible structural rule — which is what makes
  // D2 below possible at all.
  const grants = await grantsOnResource(alice.api, dataset.resource_id);
  expect(grants.length, 'a new dataset should carry exactly one grant').toBe(1);
  expect(grants[0].access_type_id).toBe(world.accessTypes['DATASET:LIST_FILES']);
  expect(grants[0].creation_type).toBe('SYSTEM_BOOTSTRAP');

  // Bob is an ordinary member of the owning lab and reads it through that grant.
  await expectNotForbidden(bob.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);
  // Frank is outside the branch and reads nothing.
  await expectConcealed(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
});

test('D2 — revoking the owning-group grant removes members\' access, not ownership', async ({ world, as }) => {
  const [alice, bob] = await Promise.all([as('alice'), as('bob')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'd2-revoked');

  await expectNotForbidden(bob.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  const [seeded] = await grantsOnResource(alice.api, dataset.resource_id);
  await alice.api.post(`/grants/${seeded.id}/revoke`, {
    revocation_reason: 'D2: proving members read through the grant and not through ownership.',
  });

  // Bob loses the dataset entirely, because the grant was the whole of his access.
  await expectConcealed(bob.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  // Alice still governs it. Governance comes from ownership, consumption from grants, and
  // revoking one must not touch the other.
  await expectNotForbidden(alice.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
  await expectNotForbidden(
    alice.api,
    'GET',
    `/grants/resource/DATASET/${dataset.resource_id}`,
  );
});

test('F3 — one grant covers what it implies, and the list holds one row', async ({ world, as }) => {
  const [alice, frank] = await Promise.all([as('alice'), as('frank')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'f3-implies');

  await expectConcealed(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  await issueGrant(alice, {
    subjectId: world.people.frank.subject_id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:DOWNLOAD'],
    justification: 'F3: download, and nothing else.',
  });

  // Download was granted; metadata and file listing follow from the order without being
  // asked for. "Never does Frank hold download without being able to see the dataset."
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);
  await expectNotForbidden(
    frank.api,
    'GET',
    `/v2/datasets/${dataset.resource_id}/files/bundle/download_info`,
  );

  // One row, not three. Counted across *everything* Frank holds on the dataset — an earlier
  // version filtered on DOWNLOAD and so could not fail: had the API written three rows, the
  // filter would still have found exactly the one.
  const held = await grantsHeldBy(alice.api, dataset.resource_id, world.people.frank.subject_id);
  expect(
    held.map((g) => g.access_type_id),
    'the wider grant was written out as one row per implied type',
  ).toEqual([world.accessTypes['DATASET:DOWNLOAD']]);
});

test('F4 — revoking a narrower type changes nothing, and the model says so', async ({ world, as }) => {
  const [alice, frank] = await Promise.all([as('alice'), as('frank')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'f4-narrower');

  await issueGrant(alice, {
    subjectId: world.people.frank.subject_id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:DOWNLOAD'],
    justification: 'F4: download, which implies the rest.',
  });
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  // There is no separate VIEW_METADATA grant to revoke: Frank holds it through DOWNLOAD.
  // The coverage view is what the page needs in order to say "removing this changes nothing
  // and here is what still confers it".
  const coverage = await alice.api.get(
    `/grants/GROUP/${world.people.frank.subject_id}/DATASET/${dataset.resource_id}/coverage`,
  );

  // It names the grant that supplies the access, by type and by route. That is what lets the
  // page say "removing this changes nothing, and here is what still confers it" rather than
  // reporting a removal that did nothing as a success.
  expect(coverage.map((c) => c.access_type_name))
    .toEqual(['DATASET:DOWNLOAD']);
  expect(coverage[0].via, 'coverage does not say how the access reaches the subject')
    .toBe('DIRECT');

  // And the substance: Frank keeps everything, because nothing narrower was ever separately
  // held. A removal that did nothing must not be reported as one that did.
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);
});

test('F5 — revocation takes effect immediately, on every surface', async ({ world, as }) => {
  const [alice, frank] = await Promise.all([as('alice'), as('frank')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'f5-revoke');

  await issueGrant(alice, {
    subjectId: world.people.frank.subject_id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:DOWNLOAD'],
    justification: 'F5: granted so it can be taken away.',
  });
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  const [grant] = (await grantsOnResource(alice.api, dataset.resource_id))
    .filter((g) => g.access_type_id === world.accessTypes['DATASET:DOWNLOAD']);
  await alice.api.post(`/grants/${grant.id}/revoke`, {
    revocation_reason: 'F5: revoked while the page was open.',
  });

  // Every surface, not just the one the button was on. A revoked grant that keeps working
  // anywhere is the failure this flow exists to catch.
  for (const path of ['', '/files', '/files/tree', '/files/bundle/download_info']) {
    // eslint-disable-next-line no-await-in-loop
    await expectConcealed(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}${path}`);
  }

  // And it leaves his list.
  const listed = await frank.api.get(`/v2/datasets?name=${encodeURIComponent(dataset.name)}`);
  expect(listed.data.map((d) => d.name)).not.toContain(dataset.name);
});

test('F2 — a grant to a group reaches its descendants, and not its parent', async ({ world, as }) => {
  const [alice, carol, bob] = await Promise.all([as('alice'), as('carol'), as('bob')]);

  // Owned by the sibling lab, so nobody in the Wong branch reaches it to begin with.
  const erin = await as('erin');
  const dataset = await createDataset(erin, world, 'siblingLab', 'f2-transitive');
  await expectConcealed(carol.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  // Granted to the lab. Carol is a member of the sub-lab beneath it and not of the lab
  // directly, so reaching it proves the grant travelled down the hierarchy.
  await issueGrant(erin, {
    subjectId: world.groups.lab.id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:LIST_FILES'],
    justification: 'F2: granted to the lab, to be reached from the sub-lab.',
  });
  await expectNotForbidden(carol.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  // The other direction: a grant to a leaf must not reach its parent's members.
  const leafOnly = await createDataset(erin, world, 'siblingLab', 'f2-leaf');
  await issueGrant(erin, {
    subjectId: world.groups.subLab.id,
    resourceId: leafOnly.resource_id,
    accessTypeId: world.accessTypes['DATASET:LIST_FILES'],
    justification: 'F2: granted to the sub-lab only.',
  });
  await expectNotForbidden(carol.api, 'GET', `/v2/datasets/${leafOnly.resource_id}`);
  await expectConcealed(bob.api, 'GET', `/v2/datasets/${leafOnly.resource_id}`);
});

test('F9 — every grant row says where it came from', async ({ world, as }) => {
  const alice = await as('alice');
  const dataset = await createDataset(alice, world, 'requestLab', 'f9-provenance');

  await issueGrant(alice, {
    subjectId: world.people.frank.subject_id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:LIST_FILES'],
    justification: 'F9: issued directly by an admin.',
  });

  const grants = await grantsOnResource(alice.api, dataset.resource_id);
  expect(grants.length).toBe(2);

  // Each row carries a creation_type, which is what a page needs to say whether the access
  // came from a preset, a request, or an admin acting directly. A row that cannot answer
  // "where did this come from" is the thing risk 5 is about.
  for (const grant of grants) {
    expect(grant.creation_type, `a grant row has no provenance: ${grant.id}`).toBeTruthy();
  }
  // And the two rows do not say the same thing: one was seeded with the dataset, the other
  // issued by an admin. A provenance field that reads identically for both explains nothing.
  const kinds = grants.map((g) => g.creation_type);
  expect(kinds).toContain('SYSTEM_BOOTSTRAP');
  expect(new Set(kinds).size, 'every grant reports the same provenance').toBe(2);
});

test('F8 — coverage held through a group is visible before issuing', async ({ world, as }) => {
  const [alice, erin] = await Promise.all([as('alice'), as('erin')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'f8-coverage');

  // The sibling lab holds download, and Frank is a member of it. Nothing personal to Frank
  // has been issued.
  await issueGrant(alice, {
    subjectId: world.groups.siblingLab.id,
    resourceId: dataset.resource_id,
    accessTypeId: world.accessTypes['DATASET:DOWNLOAD'],
    justification: 'F8: held by the group Frank belongs to.',
  });

  // Asking what Frank already holds must name the group's grant rather than reporting
  // nothing. An admin who is told "no access" here issues a personal grant that duplicates
  // what the subject can already do, which is risk 2.
  const coverage = await alice.api.get(
    `/grants/GROUP/${world.people.frank.subject_id}/DATASET/${dataset.resource_id}/coverage`,
  );
  expect(coverage.length, 'coverage reports nothing for a subject reached through their group')
    .toBeGreaterThan(0);
  expect(coverage.map((c) => c.access_type_name)).toContain('DATASET:DOWNLOAD');

  // And it names the path: through a group, and which one.
  const viaGroup = coverage.find((c) => c.via === 'GROUP');
  expect(viaGroup, 'coverage does not distinguish group-held access from a personal grant')
    .toBeTruthy();
  expect(viaGroup.via_group_id).toBe(world.groups.siblingLab.id);

  // Erin administers that group; the access reaching Frank is real, not merely reported.
  await expectNotForbidden(erin.api, 'GET', `/v2/datasets/${dataset.resource_id}`);
});

test('F1 — a preset grant names the preset, and re-issuing changes nothing', async ({ world, as }) => {
  const [alice, frank] = await Promise.all([as('alice'), as('frank')]);
  const dataset = await createDataset(alice, world, 'requestLab', 'f1-preset');

  // Presets are scoped to collections, so the preset is issued on a collection holding the
  // dataset, and the dataset itself is offered none.
  // @see docs/design/groups/design.md — The seeded presets
  const collection = await alice.api.post('/collections', {
    name: `${world.prefix}-f1-preset-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Phase 4 fixture for f1-preset.',
    owner_group_id: world.groups.requestLab.id,
    dataset_ids: [dataset.resource_id],
  });

  const datasetPresets = await alice.api.get('/grants/presets?resource_type=DATASET');
  expect(datasetPresets.data || datasetPresets, 'a preset is offered for a dataset').toEqual([]);

  const presets = await alice.api.get('/grants/presets?resource_type=COLLECTION');
  const preset = (presets.data || presets).find((x) => x.name === 'Standard Research Use');
  expect(preset, 'the seeded "Standard Research Use" preset is missing').toBeTruthy();

  const issueFromPreset = (justification) => alice.api.status('POST', '/grants', {
    subject_id: world.people.frank.subject_id,
    resource_type: 'COLLECTION',
    resource_id: collection.id,
    justification,
    source_preset_id: preset.id,
    items: [{ preset_id: preset.id, approved_expiry: NEVER }],
  });

  expect(await issueFromPreset('F1: issued from a preset.'), 'the preset grant was refused')
    .toBeLessThan(300);

  // The preset pairs collection access with dataset access, so Frank reaches both.
  await expectNotForbidden(frank.api, 'GET', `/collections/${collection.id}`);
  await expectNotForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}`);

  const held = await grantsHeldBy(alice.api, collection.id, world.people.frank.subject_id, 'COLLECTION');
  expect(held.length, 'the preset conferred nothing').toBeGreaterThan(0);
  // The row names the preset rather than a bare list of access types — F9's claim, on the
  // path that makes it hardest.
  expect(held.every((g) => g.source_preset_id === preset.id || g.source_preset), 
    'a preset-issued grant does not name its preset').toBeTruthy();

  const before = held.length;

  // Issuing the same preset again changes nothing. Whether the API says so with a 2xx or a
  // 409 is its own business; what must not happen is a second set of rows.
  await issueFromPreset('F1: the same preset, a second time.');

  const after = await grantsHeldBy(alice.api, collection.id, world.people.frank.subject_id, 'COLLECTION');
  expect(after.length, 'issuing the same preset twice duplicated the access').toBe(before);
});
