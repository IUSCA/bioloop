/**
 * dataset.name-available.test.js
 *
 * The v2 name check is scoped to one owning group. Two groups may hold the same name, so a
 * name taken in one group is still free in another, and the answer never reveals anything
 * about a group the caller cannot contribute to.
 *
 * @see docs/design/groups/dataset-creation.md — Asking whether a name is free, without an oracle
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { isDatasetNameAvailable, getOwnerGroupForAuthorization } = require('@/services/datasets_v2');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let groupA;
let groupB;
let taken;

const usersToDelete = [];
const groupsToDelete = [];
const datasetsToDelete = [];

// Already in normalised form: creation normalises, so this is the shape actually stored.
const TAKEN_NAME = `Taken-Name-${Date.now()}`;

beforeAll(async () => {
  actor = await createTestUser('_nav_actor');
  usersToDelete.push(actor.id);
  groupA = await createTestGroup(actor.subject_id, '_nav_a');
  groupB = await createTestGroup(actor.subject_id, '_nav_b');
  groupsToDelete.push(groupA.id, groupB.id);

  taken = await createTestDataset(groupA.id, '', { name: TAKEN_NAME });
  datasetsToDelete.push(taken.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
    if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('isDatasetNameAvailable', () => {
  test('reports a name held by this group as unavailable', async () => {
    const result = await isDatasetNameAvailable({
      name: TAKEN_NAME, type: 'RAW_DATA', owner_group_id: groupA.id,
    });

    expect(result.available).toBe(false);
  });

  test('reports the same name as free in another group', async () => {
    // The point of the per-group key. A name taken next door is not taken here.
    const result = await isDatasetNameAvailable({
      name: TAKEN_NAME, type: 'RAW_DATA', owner_group_id: groupB.id,
    });

    expect(result.available).toBe(true);
  });

  test('reports the same name as free for another type', async () => {
    const result = await isDatasetNameAvailable({
      name: TAKEN_NAME, type: 'DATA_PRODUCT', owner_group_id: groupA.id,
    });

    expect(result.available).toBe(true);
  });

  test('answers about the normalised name, which is what creation stores', async () => {
    // createTestDataset stored the raw name; creation through the v2 builder normalises.
    // The check has to normalise the same way or it answers about a name nobody can hold.
    const result = await isDatasetNameAvailable({
      name: 'has spaces and/slashes', type: 'RAW_DATA', owner_group_id: groupA.id,
    });

    expect(result.normalized_name).toBe('has-spaces-and-slashes');
  });

  test('ignores deleted datasets, whose names are free again', async () => {
    const gone = await createTestDataset(groupB.id, '', { name: `Gone-${Date.now()}`, is_deleted: true });
    datasetsToDelete.push(gone.id);

    const result = await isDatasetNameAvailable({
      name: gone.name, type: 'RAW_DATA', owner_group_id: groupB.id,
    });

    expect(result.available).toBe(true);
  });
});

describe('getOwnerGroupForAuthorization', () => {
  test('returns the contribution flag the policy needs', async () => {
    const group = await getOwnerGroupForAuthorization(groupA.id);

    expect(group.id).toBe(groupA.id);
    expect(typeof group.allow_user_contributions).toBe('boolean');
  });

  test('returns nothing for an archived group, which takes no new datasets', async () => {
    await prisma.group.update({
      where: { id: groupB.id },
      data: { is_archived: true, archived_at: new Date() },
    });

    expect(await getOwnerGroupForAuthorization(groupB.id)).toBeNull();

    await prisma.group.update({
      where: { id: groupB.id },
      data: { is_archived: false, archived_at: null },
    });
  });
});
