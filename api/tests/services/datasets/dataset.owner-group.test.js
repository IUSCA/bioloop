/**
 * dataset.owner-group.test.js
 *
 * Every dataset is governed by exactly one group. The column is NOT NULL with a database
 * default naming the seeded 'Unassigned Datasets' group, so a legacy caller that sends no
 * group still produces a row with an owner. The v2 service refuses without an explicit
 * group, so only legacy callers reach the default.
 *
 * Also covers the naming rule those two facts exist to support: a dataset name is unique
 * within its owning group rather than across the whole system.
 *
 * @see docs/design/groups/dataset-storage.md — What group scoping changed
 * @see docs/design/groups/decisions.md — 2. Every dataset has an owning group
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { buildDatasetCreateQuery } = require('@/services/datasets_v2');
const { UNASSIGNED_DATASETS_GROUP_ID } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let group;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_dog_actor');
  usersToDelete.push(actor.id);
  group = await createTestGroup(actor.subject_id, '_dog_group');
  groupsToDelete.push(group.id);
}, 20_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('every dataset has an owning group', () => {
  test('a dataset can be created with an owning group', async () => {
    const dataset = await createTestDataset(group.id, '_dog_ok');
    datasetsToDelete.push(dataset.id);

    expect(dataset.owner_group_id).toBe(group.id);
  });

  test('the v2 service refuses to create a dataset with no owning group', () => {
    // v2 never reaches the database default. A dataset it creates names its group.
    expect(() => buildDatasetCreateQuery({ name: 'Orphan', type: 'RAW_DATA' }))
      .toThrow(/owner_group_id/);
  });

  test('an insert that names no group lands in Unassigned Datasets', async () => {
    // This is what keeps the legacy creation routes working. They send no owning group, and
    // the column default parks the row rather than rejecting it.
    const resource_id = randomUUID();
    await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });
    const name = `Orphan Dataset ${Date.now()}`;

    await prisma.$executeRaw`
      INSERT INTO "dataset" ("name", "type", "is_deleted", "resource_id")
      VALUES (${name}, 'RAW_DATA', false, ${resource_id})
    `;

    const orphan = await prisma.dataset.findFirst({ where: { name } });
    expect(orphan).not.toBeNull();
    expect(orphan.owner_group_id).toBe(UNASSIGNED_DATASETS_GROUP_ID);

    await prisma.dataset.deleteMany({ where: { id: orphan.id } });
    await prisma.resource.deleteMany({ where: { id: resource_id } });
  });

  test('an explicit NULL owning group is rejected', async () => {
    // The default covers a caller that omits the column. One that insists on NULL is asking
    // for a dataset no group governs, which is the state the constraint exists to prevent.
    const resource_id = randomUUID();
    await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });
    const name = `Explicit Null ${Date.now()}`;

    await expect(prisma.$executeRaw`
      INSERT INTO "dataset" ("name", "type", "is_deleted", "resource_id", "owner_group_id")
      VALUES (${name}, 'RAW_DATA', false, ${resource_id}, NULL)
    `).rejects.toThrow();

    await prisma.resource.deleteMany({ where: { id: resource_id } });
  });

  test('two groups may hold a dataset of the same name and type', async () => {
    // The whole point of the per-group key. Neither group can discover that the other holds
    // the name, and neither can deny it to the other by taking it first.
    const other = await createTestGroup(actor.subject_id, '_dog_other');
    groupsToDelete.push(other.id);

    const shared_name = `Shared Name ${Date.now()}`;
    const first = await createTestDataset(group.id, '', { name: shared_name });
    datasetsToDelete.push(first.id);
    const second = await createTestDataset(other.id, '', { name: shared_name });
    datasetsToDelete.push(second.id);

    expect(first.name).toBe(second.name);
    expect(first.type).toBe(second.type);
    expect(first.owner_group_id).not.toBe(second.owner_group_id);
  });

  test('one group may not hold the same name twice', async () => {
    const dup_name = `Duplicate Name ${Date.now()}`;
    const first = await createTestDataset(group.id, '', { name: dup_name });
    datasetsToDelete.push(first.id);

    await expect(createTestDataset(group.id, '', { name: dup_name })).rejects.toThrow();
  });

  test('an owning group cannot be deleted while it still owns datasets', async () => {
    const doomed = await createTestGroup(actor.subject_id, '_dog_doomed');
    groupsToDelete.push(doomed.id);
    const dataset = await createTestDataset(doomed.id, '_dog_held');
    datasetsToDelete.push(dataset.id);

    // The foreign key is ON DELETE RESTRICT, so the dataset would otherwise be orphaned.
    await expect(
      prisma.group.delete({ where: { id: doomed.id } }),
    ).rejects.toThrow();
  });
});

describe('the quarantine group', () => {
  test('exists, is archived, and is marked as a system group', async () => {
    const quarantine = await prisma.group.findUnique({
      where: { id: UNASSIGNED_DATASETS_GROUP_ID },
    });

    expect(quarantine).not.toBeNull();
    expect(quarantine.is_archived).toBe(true);
    expect(quarantine.archived_at).not.toBeNull();
    expect(quarantine.slug).toBe('unassigned-datasets');
    expect(quarantine.metadata).toEqual({ type: 'system' });
  });

  test('has nobody in it, so only platform admins reach it', async () => {
    const members = await prisma.group_user.count({
      where: { group_id: UNASSIGNED_DATASETS_GROUP_ID },
    });

    expect(members).toBe(0);
  });

  test('is listable, so its contents can be worked through', async () => {
    const { data, metadata } = await groupsService.searchAllGroups({
      user_id: actor.subject_id,
      group_id: UNASSIGNED_DATASETS_GROUP_ID,
      sort_by: 'name',
      sort_order: 'asc',
      limit: 10,
      offset: 0,
      is_archived: true,
    });

    expect(metadata.total).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(UNASSIGNED_DATASETS_GROUP_ID);
    expect(data[0].name).toBe('Unassigned Datasets');
  });

  test('cannot be deleted, so the next batch of orphans has somewhere to go', async () => {
    // A DO INSTEAD NOTHING rule swallows the delete rather than raising, so assert on the
    // row still being there afterwards.
    await prisma.$executeRaw`DELETE FROM "group" WHERE id = ${UNASSIGNED_DATASETS_GROUP_ID}`;

    const quarantine = await prisma.group.findUnique({
      where: { id: UNASSIGNED_DATASETS_GROUP_ID },
    });
    expect(quarantine).not.toBeNull();
  });

  test('has an id that route validation accepts', async () => {
    // The group detail page addresses a group by id, and express-validator's isUUID()
    // rejects a zero-filled sentinel: the version and variant nibbles have to be set.
    // Without this the group is listable but its page returns 400.
    // eslint-disable-next-line global-require
    const validator = require('validator');

    expect(validator.isUUID(UNASSIGNED_DATASETS_GROUP_ID)).toBe(true);
    // And it must not collide with the deterministic ids the seed generates, which count up
    // from zero in the last eight bytes with the same version and variant nibbles set.
    expect(UNASSIGNED_DATASETS_GROUP_ID.startsWith('00000000')).toBe(false);
  });

  test('has an archive_key, so its datasets have somewhere to be archived', async () => {
    const quarantine = await prisma.group.findUnique({
      where: { id: UNASSIGNED_DATASETS_GROUP_ID },
    });

    expect(quarantine.archive_key).toBe('unassigned-datasets');
  });

  test('takes part in the closure table like any other group', async () => {
    const selfEdge = await prisma.group_closure.findUnique({
      where: {
        ancestor_id_descendant_id: {
          ancestor_id: UNASSIGNED_DATASETS_GROUP_ID,
          descendant_id: UNASSIGNED_DATASETS_GROUP_ID,
        },
      },
    });

    expect(selfEdge).not.toBeNull();
    expect(selfEdge.depth).toBe(0);
  });
});
