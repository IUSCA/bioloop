/**
 * derivedOpenness.test.js
 *
 * A derived dataset is never reachable by a wider audience than its sources.
 *
 * @see docs/design/groups/use-cases.md — use case 58
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
let member;
let group;

const createdGrantIds = [];
const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_dop_actor');
  member = await createTestUser('_dop_member');
  usersToDelete.push(actor.id, member.id);
  group = await createTestGroup(actor.subject_id, '_dop_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { id: { in: createdGrantIds } } });
  await prisma.dataset_hierarchy.deleteMany({
    where: { OR: [{ source_id: { in: datasetsToDelete } }, { derived_id: { in: datasetsToDelete } }] },
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

describe('a grant to a group or a user', () => {
  test('is allowed on a derivative of a dataset nobody has been granted', async () => {
    const source = await newDataset('_dop_s1');
    const derived = await newDataset('_dop_d1');
    await derive(source, derived);

    // The owning group already reaches every dataset, so a scoped grant cannot widen one
    // past the people already entitled to see it.
    await expect(grant(member.subject_id, derived)).resolves.toBeDefined();
  });
});

describe('a grant to a system principal', () => {
  test('is refused when the source is not shared that widely', async () => {
    const source = await newDataset('_dop_s2');
    const derived = await newDataset('_dop_d2');
    await derive(source, derived);

    await expect(grant(PUBLIC_GROUP_ID, derived)).rejects.toThrow(/derived from/);
    await expect(grant(AUTHENTICATED_USERS_GROUP_ID, derived)).rejects.toThrow(/derived from/);
  });

  test('names the source that is too narrow', async () => {
    const source = await newDataset('_dop_s3');
    const derived = await newDataset('_dop_d3');
    await derive(source, derived);

    await expect(grant(PUBLIC_GROUP_ID, derived)).rejects.toThrow(new RegExp(source.name));
  });

  test('writes nothing when it refuses', async () => {
    const source = await newDataset('_dop_s4');
    const derived = await newDataset('_dop_d4');
    await derive(source, derived);

    await expect(grant(PUBLIC_GROUP_ID, derived)).rejects.toThrow();

    const left = await prisma.grant.count({ where: { resource_id: derived.resource_id } });
    expect(left).toBe(0);
  });

  test('is allowed once the source is granted to the same principal', async () => {
    const source = await newDataset('_dop_s5');
    const derived = await newDataset('_dop_d5');
    await derive(source, derived);

    await grant(PUBLIC_GROUP_ID, source);

    await expect(grant(PUBLIC_GROUP_ID, derived)).resolves.toBeDefined();
  });

  test('accepts a wider source for a narrower grant, but not the reverse', async () => {
    const source = await newDataset('_dop_s6');
    const derivedA = await newDataset('_dop_d6a');
    const derivedB = await newDataset('_dop_d6b');
    await derive(source, derivedA);
    await derive(source, derivedB);

    // A public source is open enough for an authenticated-users grant on its derivative.
    await grant(PUBLIC_GROUP_ID, source);
    await expect(grant(AUTHENTICATED_USERS_GROUP_ID, derivedA)).resolves.toBeDefined();

    // An authenticated-only source is not open enough for a public grant.
    const narrowSource = await newDataset('_dop_s6n');
    const narrowDerived = await newDataset('_dop_d6n');
    await derive(narrowSource, narrowDerived);
    await grant(AUTHENTICATED_USERS_GROUP_ID, narrowSource);

    await expect(grant(PUBLIC_GROUP_ID, narrowDerived)).rejects.toThrow(/derived from/);
    await expect(grant(AUTHENTICATED_USERS_GROUP_ID, narrowDerived)).resolves.toBeDefined();
  });
});

describe('a derivative with several sources', () => {
  test('takes the narrowest of them', async () => {
    const openSource = await newDataset('_dop_s7open');
    const closedSource = await newDataset('_dop_s7closed');
    const derived = await newDataset('_dop_d7');
    await derive(openSource, derived);
    await derive(closedSource, derived);

    await grant(PUBLIC_GROUP_ID, openSource);

    // One open source is not enough; the other still is not shared publicly.
    await expect(grant(PUBLIC_GROUP_ID, derived)).rejects.toThrow(new RegExp(closedSource.name));

    await grant(PUBLIC_GROUP_ID, closedSource);
    await expect(grant(PUBLIC_GROUP_ID, derived)).resolves.toBeDefined();
  });
});

describe('the chain of derivation', () => {
  test('is walked all the way, so a grandchild cannot escape through its parent', async () => {
    const root = await newDataset('_dop_s8root');
    const middle = await newDataset('_dop_s8mid');
    const leaf = await newDataset('_dop_s8leaf');
    await derive(root, middle);
    await derive(middle, leaf);

    // Put the middle dataset in a state the rule would not have allowed at issue time:
    // public, while the root it came from is not. That state is reachable in a running
    // system, because the check runs when a grant is issued and the root's own grant can be
    // revoked afterwards. Written straight to the table so the rule under test does not
    // reject the setup.
    const seeded = await prisma.grant.create({
      data: {
        subject_id: PUBLIC_GROUP_ID,
        resource_id: middle.resource_id,
        access_type_id: await accessTypeId('DATASET:VIEW_METADATA'),
        granted_by: actor.subject_id,
        creation_type: 'MANUAL',
      },
    });
    createdGrantIds.push(seeded.id);

    // Walking only the direct source would find the public middle dataset and allow this.
    await expect(grant(PUBLIC_GROUP_ID, leaf)).rejects.toThrow(new RegExp(root.name));
  });
});

describe('an unrelated dataset', () => {
  test('is unaffected, and can be granted to either principal', async () => {
    const standalone = await newDataset('_dop_s9');

    await expect(grant(PUBLIC_GROUP_ID, standalone)).resolves.toBeDefined();
  });
});
