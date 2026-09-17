/**
 * dataset.bulk-create.test.js
 *
 * `bulkCreateDatasets` answers with four lists, and which list a dataset lands in is the
 * whole contract: the watch script starts a workflow for `created`, ignores `conflicted`,
 * and reports `refused` and `errored`. A refusal carries its status and message because no
 * later scan will place that dataset; an internal failure carries neither, because its
 * message is written for the log rather than for the caller.
 *
 * @see docs/design/groups/dataset-creation.md — The watch script
 */

const path = require('path');
const { randomUUID } = require('crypto');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { bulkCreateDatasets } = require('@/services/datasets_v2');
const {
  createTestUser,
  createTestGroup,
  deleteDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let group;
let archivedGroup;

const groupsToDelete = [];
const usersToDelete = [];

/** A bulk request body, the same shape the single-create route takes. */
const payload = (name, owner_group_id) => ({
  name, type: 'RAW_DATA', owner_group_id, origin_path: `/tmp/${name}`,
});

/** Every dataset a test placed, grants included — a created dataset holds a seeded grant. */
const cleanUpDatasets = async (owner_group_id) => {
  const rows = await prisma.dataset.findMany({ where: { owner_group_id }, select: { id: true } });
  for (const row of rows) await deleteDataset(row.id).catch(() => {});
};

beforeAll(async () => {
  actor = await createTestUser('_dbc_actor');
  usersToDelete.push(actor.id);

  group = await createTestGroup(actor.subject_id, '_dbc_group');
  archivedGroup = await createTestGroup(actor.subject_id, '_dbc_archived');
  groupsToDelete.push(group.id, archivedGroup.id);

  await groupsService.archiveGroup(archivedGroup.id, actor.subject_id);
}, 20_000);

afterAll(async () => {
  for (const id of groupsToDelete) await cleanUpDatasets(id);
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('bulkCreateDatasets sorts each dataset into one of four lists', () => {
  test('a dataset that is placed comes back in created', async () => {
    const result = await bulkCreateDatasets([payload('_dbc_new', group.id)], actor.id, actor.subject_id);

    expect(result.created).toHaveLength(1);
    expect(result.created[0].name).toBe('_dbc_new');
    expect(result.created[0].owner_group_id).toBe(group.id);
    expect([result.conflicted, result.refused, result.errored]).toEqual([[], [], []]);
  });

  test('a name and type the group already holds comes back in conflicted', async () => {
    // The watch script sees the same directory on every pass, so this is the ordinary case.
    const result = await bulkCreateDatasets([payload('_dbc_new', group.id)], actor.id, actor.subject_id);

    expect(result.created).toEqual([]);
    expect(result.conflicted).toEqual([{ name: '_dbc_new', type: 'RAW_DATA' }]);
    expect([result.refused, result.errored]).toEqual([[], []]);
  });

  test('an archived owning group refuses, with the status and the reason', async () => {
    const result = await bulkCreateDatasets([payload('_dbc_arch', archivedGroup.id)], actor.id, actor.subject_id);

    expect(result.created).toEqual([]);
    expect([result.conflicted, result.errored]).toEqual([[], []]);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0]).toMatchObject({ name: '_dbc_arch', type: 'RAW_DATA', status: 409 });
    expect(result.refused[0].message).toMatch(/archived/);

    // Nothing was written for the refused dataset.
    const rows = await prisma.dataset.findMany({ where: { owner_group_id: archivedGroup.id } });
    expect(rows).toEqual([]);
  });

  test('an internal failure comes back in errored, with no message for the caller', async () => {
    // A group id that resolves to no row. The service reads the owning group before it
    // writes anything, so this fails the way a database fault would rather than as a 4xx.
    const result = await bulkCreateDatasets([payload('_dbc_ghost', randomUUID())], actor.id, actor.subject_id);

    expect(result.created).toEqual([]);
    expect([result.conflicted, result.refused]).toEqual([[], []]);
    expect(result.errored).toEqual([{ name: '_dbc_ghost', type: 'RAW_DATA' }]);
  });

  test('one refusal does not stop the datasets around it', async () => {
    const result = await bulkCreateDatasets([
      payload('_dbc_mixed_ok', group.id),
      payload('_dbc_mixed_arch', archivedGroup.id),
      payload('_dbc_new', group.id),
    ], actor.id, actor.subject_id);

    expect(result.created.map((d) => d.name)).toEqual(['_dbc_mixed_ok']);
    expect(result.conflicted).toEqual([{ name: '_dbc_new', type: 'RAW_DATA' }]);
    expect(result.refused.map((d) => d.name)).toEqual(['_dbc_mixed_arch']);
    expect(result.errored).toEqual([]);
  });
});
