/**
 * dataset.owner-group.test.js
 *
 * Every dataset is governed by exactly one group. Covers the NOT NULL constraint on
 * dataset.owner_group_id and the archived quarantine group that holds the datasets which
 * had no owner when the constraint landed.
 *
 * @see docs/design/groups/decisions.md — 2. Every dataset has an owning group
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
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

describe('dataset.owner_group_id is required', () => {
  test('a dataset can be created with an owning group', async () => {
    const dataset = await createTestDataset(group.id, '_dog_ok');
    datasetsToDelete.push(dataset.id);

    expect(dataset.owner_group_id).toBe(group.id);
  });

  test('the database rejects a dataset with no owning group', async () => {
    // Go around Prisma's own required-argument check to prove the constraint is in the
    // database, not only in the generated client.
    const resource_id = randomUUID();
    await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });

    const insert = prisma.$executeRaw`
      INSERT INTO "dataset" ("name", "type", "is_deleted", "resource_id", "owner_group_id")
      VALUES (${`Orphan Dataset ${Date.now()}`}, 'RAW_DATA', false, ${resource_id}, NULL)
    `;

    // 23502 is Postgres not_null_violation. Prisma renders the failing row rather than the
    // column name, so match the code.
    await expect(insert).rejects.toThrow(/23502/);

    await prisma.resource.deleteMany({ where: { id: resource_id } });
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
