/**
 * derivedIndependence.test.js
 *
 * A derived dataset's access is decided on the derivative alone. Its sources do not
 * constrain it, and it does not constrain its sources.
 *
 * These tests pin a reversal rather than a feature. A grant-time rule refusing a
 * derivative wider than its narrowest source was built and then removed, so the absence
 * of that rule is asserted here. Without these, reintroducing the coupling would pass.
 *
 * @see docs/design/groups/decisions.md — 10. Derived and source dataset access are independent
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const { AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let group;

const createdGrantIds = [];
const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_din_actor');
  usersToDelete.push(actor.id);
  group = await createTestGroup(actor.subject_id, '_din_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { id: { in: createdGrantIds } } });
  await prisma.dataset_hierarchy.deleteMany({
    where: {
      OR: [
        { source_id: { in: datasetsToDelete } },
        { derived_id: { in: datasetsToDelete } },
      ],
    },
  });
  for (const id of datasetsToDelete) {
    await prisma.grant.deleteMany({ where: { resource: { dataset: { id } } } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

async function newDataset(tag) {
  const d = await createTestDataset(group.id, tag);
  datasetsToDelete.push(d.id);
  return d;
}

async function derive(source, derived) {
  await prisma.dataset_hierarchy.create({
    data: { source_id: source.id, derived_id: derived.id },
  });
}

async function accessTypeId(name) {
  const row = await prisma.grant_access_type.findFirst({ where: { name } });
  return row.id;
}

async function grant(subject_id, dataset) {
  const g = await grantsService.createGrant(
    {
      subject_id,
      resource_id: dataset.resource_id,
      access_type_id: await accessTypeId('DATASET:VIEW_METADATA'),
    },
    actor.subject_id,
  );
  createdGrantIds.push(g.id);
  return g;
}

describe('a derivative can be shared more widely than its source', () => {
  test('granting a derivative to Public leaves the source scoped', async () => {
    const source = await newDataset('_din_s1');
    const derived = await newDataset('_din_d1');
    await derive(source, derived);

    const g = await grant(PUBLIC_GROUP_ID, derived);
    expect(g.id).toBeDefined();

    // The source gained nothing. This is the aggregate-of-restricted-data case: the
    // derivative is new data, and sharing it says nothing about its input.
    const onSource = await prisma.grant.findMany({
      where: { resource_id: source.resource_id },
    });
    expect(onSource).toHaveLength(0);
  });

  test('granting a derivative to Authenticated Users is allowed too', async () => {
    const source = await newDataset('_din_s2');
    const derived = await newDataset('_din_d2');
    await derive(source, derived);

    await expect(grant(AUTHENTICATED_USERS_GROUP_ID, derived)).resolves.toBeDefined();
  });

  test('a chain of derivations does not accumulate a ceiling', async () => {
    const source = await newDataset('_din_s3');
    const middle = await newDataset('_din_m3');
    const derived = await newDataset('_din_d3');
    await derive(source, middle);
    await derive(middle, derived);

    await expect(grant(PUBLIC_GROUP_ID, derived)).resolves.toBeDefined();
  });

  test('several sources do not combine into a narrowest one', async () => {
    const sourceA = await newDataset('_din_s4a');
    const sourceB = await newDataset('_din_s4b');
    const derived = await newDataset('_din_d4');
    await derive(sourceA, derived);
    await derive(sourceB, derived);

    await expect(grant(PUBLIC_GROUP_ID, derived)).resolves.toBeDefined();
  });
});

describe('a source can be shared more widely than its derivative', () => {
  test('granting a source to Public leaves the derivative scoped', async () => {
    const source = await newDataset('_din_s5');
    const derived = await newDataset('_din_d5');
    await derive(source, derived);

    await expect(grant(PUBLIC_GROUP_ID, source)).resolves.toBeDefined();

    const onDerived = await prisma.grant.findMany({
      where: { resource_id: derived.resource_id },
    });
    expect(onDerived).toHaveLength(0);
  });
});

describe('lineage is recorded but is not an authorization edge', () => {
  test('the hierarchy row exists and confers nothing', async () => {
    const source = await newDataset('_din_s6');
    const derived = await newDataset('_din_d6');
    await derive(source, derived);

    // dataset_hierarchy still drives the Sources and Derivatives tabs.
    const lineage = await prisma.dataset_hierarchy.findMany({
      where: { derived_id: derived.id },
    });
    expect(lineage).toHaveLength(1);
    expect(lineage[0].source_id).toBe(source.id);

    const stranger = await createTestUser('_din_stranger');
    usersToDelete.push(stranger.id);

    await grant(stranger.subject_id, source);

    // Reaching the source says nothing about reaching the derivative.
    const reachesDerived = await grantsService.userHasGrant({
      user_id: stranger.subject_id,
      resource_type: 'DATASET',
      resource_id: derived.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });
    expect(reachesDerived).toBe(false);
  });
});
