/**
 * dataset.delete.test.js
 *
 * Deleting a dataset. Two mechanisms that look alike and are not: the v2 archive route soft
 * deletes, marking the row and leaving it in place, while an actual row delete fires a
 * database trigger that takes the resource row with it.
 *
 * @see .todo/issues/06-dataset-actions-workflows.md — Phase 6
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { RESOURCE_TYPE, GRANT_CREATION_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const wfService = require('@/services/workflow');
const datasetService = require('@/services/datasets_v2');
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

/** Removes a dataset and whatever now blocks its removal. */
async function reap(id) {
  const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
  if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
  await prisma.dataset.deleteMany({ where: { id } });
}

beforeAll(async () => {
  actor = await createTestUser('_del_actor');
  usersToDelete.push(actor.id);
  group = await createTestGroup(actor.subject_id, '_del_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) await reap(id);
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('soft delete leaves the row in place', () => {
  test('marks the dataset deleted, records the state, and writes an audit row', async () => {
    const dataset = await createTestDataset(group.id, '_del_soft');
    datasetsToDelete.push(dataset.id);

    await datasetService.softDelete(dataset.id, actor.id);

    const after = await prisma.dataset.findUnique({
      where: { id: dataset.id },
      include: { states: true, audit_logs: true },
    });

    // Still there. "Deleted" is a flag, not an absence.
    expect(after).not.toBeNull();
    expect(after.is_deleted).toBe(true);
    expect(after.states.map((s) => s.state)).toContain('DELETED');
    expect(after.audit_logs.some((a) => a.action === 'delete' && a.user_id === actor.id))
      .toBe(true);
  });

  test('the resource row survives, so grants and requests still resolve', async () => {
    const dataset = await createTestDataset(group.id, '_del_keep_res');
    datasetsToDelete.push(dataset.id);

    await datasetService.softDelete(dataset.id, actor.id);

    const resource = await prisma.resource.findUnique({ where: { id: dataset.resource_id } });
    expect(resource).not.toBeNull();
  });

  // Names are unique among live rows only, so deleted rows of one name may accumulate.
  // @see docs/design/groups/dataset-storage.md — What group scoping changed
  test('a second dataset with the same name in the same group can be deleted too', async () => {
    const name = `Test Dataset ${Date.now()}_del_same_name`;

    const first = await createTestDataset(group.id, '', { name });
    datasetsToDelete.push(first.id);
    await datasetService.softDelete(first.id, actor.id);

    // The name is free again once the first is deleted, so the group may register it anew.
    const second = await createTestDataset(group.id, '', { name });
    datasetsToDelete.push(second.id);
    await datasetService.softDelete(second.id, actor.id);

    const after = await prisma.dataset.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { name: true, is_deleted: true },
    });
    // Both deleted, and neither renamed to make room for the other.
    expect(after).toEqual([
      { name, is_deleted: true },
      { name, is_deleted: true },
    ]);
  });

  test('two live datasets of the same name and type in one group are still refused', async () => {
    const name = `Test Dataset ${Date.now()}_del_live_dup`;
    const first = await createTestDataset(group.id, '', { name });
    datasetsToDelete.push(first.id);

    // One nested create, so the refused insert takes its resource row with it. The helper
    // creates the resource first and would leave it behind.
    await expect(prisma.dataset.create({
      data: {
        name,
        type: first.type,
        owner_group: { connect: { id: group.id } },
        resource: { create: { id: randomUUID(), type: RESOURCE_TYPE.DATASET } },
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  test('an archived dataset starts a delete workflow instead of being marked', async () => {
    // Bytes live in the archive, so removing the row without removing them would strand
    // them. The workflow marks the dataset deleted when it succeeds.
    const dataset = await createTestDataset(group.id, '_del_arch', {
      archive_path: '/archive/somewhere.tar',
    });
    datasetsToDelete.push(dataset.id);

    const create = jest.spyOn(wfService, 'create')
      .mockResolvedValue({ data: { workflow_id: randomUUID() } });

    await datasetService.softDelete(dataset.id, actor.id);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ name: 'delete' });

    const after = await prisma.dataset.findUnique({ where: { id: dataset.id } });
    expect(after.is_deleted).toBe(false);
  });
});

describe('deleting the row cascades to the resource', () => {
  test('the trigger removes the resource the dataset pointed at', async () => {
    const dataset = await createTestDataset(group.id, '_del_cascade');
    const { resource_id } = dataset;

    await prisma.grant.deleteMany({ where: { resource_id } });
    await prisma.dataset.delete({ where: { id: dataset.id } });

    // No application code deletes this. A database trigger does, so a resource row cannot
    // outlive the dataset it identifies.
    const resource = await prisma.resource.findUnique({ where: { id: resource_id } });
    expect(resource).toBeNull();
  });

  test('a seeded owning-group grant blocks the delete until it is removed', async () => {
    // grant.resource is ON DELETE RESTRICT and creating a resource through v2 seeds a grant,
    // so anything that hard-deletes has to clear grants first.
    const dataset = await createTestDataset(group.id, '_del_grant');
    datasetsToDelete.push(dataset.id);

    const accessType = await prisma.grant_access_type.findFirstOrThrow({
      where: { name: 'DATASET:LIST_FILES' },
    });
    await prisma.grant.create({
      data: {
        subject_id: group.id,
        resource_id: dataset.resource_id,
        access_type_id: accessType.id,
        granted_by: actor.subject_id,
        creation_type: GRANT_CREATION_TYPE.SYSTEM_BOOTSTRAP,
      },
    });

    await expect(prisma.dataset.delete({ where: { id: dataset.id } })).rejects.toThrow();

    // And the dataset is still there, rather than half removed.
    expect(await prisma.dataset.findUnique({ where: { id: dataset.id } })).not.toBeNull();
  });

  test('files and states go with the dataset, being ON DELETE CASCADE', async () => {
    const dataset = await createTestDataset(group.id, '_del_children');
    await prisma.dataset_file.create({
      data: { name: 'a.txt', path: 'a.txt', dataset_id: dataset.id },
    });
    await prisma.dataset_state.create({
      data: { state: 'REGISTERED', dataset_id: dataset.id },
    });

    await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
    await prisma.dataset.delete({ where: { id: dataset.id } });

    expect(await prisma.dataset_file.count({ where: { dataset_id: dataset.id } })).toBe(0);
    expect(await prisma.dataset_state.count({ where: { dataset_id: dataset.id } })).toBe(0);
  });
});

describe('the resource type a dataset carries', () => {
  test('is DATASET, which is how polymorphic grants find it', async () => {
    const dataset = await createTestDataset(group.id, '_del_type');
    datasetsToDelete.push(dataset.id);

    const resource = await prisma.resource.findUnique({ where: { id: dataset.resource_id } });
    expect(resource.type).toBe(RESOURCE_TYPE.DATASET);
  });
});
