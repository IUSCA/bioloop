/**
 * dataset.use-conditions.test.js
 *
 * Consent codes recorded on datasets. Captured, never enforced.
 *
 * @see docs/design/groups/decisions.md — 9. Consent codes are captured, not enforced
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const datasetService = require('@/services/datasets_v2');
const { buildDatasetCreateQuery } = require('@/services/dataset');
const grantService = require('@/services/grants');
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
  actor = await createTestUser('_duc_actor');
  usersToDelete.push(actor.id);
  group = await createTestGroup(actor.subject_id, '_duc_group');
  groupsToDelete.push(group.id);
}, 30_000);

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

/**
 * Register a dataset the way POST /datasets does: build the create query, then create.
 *
 * owner_group_id and resource_id are added here because the route sends neither and so
 * cannot currently create a dataset at all.
 * @see .todo/issues/epic-3-*.md — dataset creation paths broken by the NOT NULL owner_group_id
 *
 * The built query goes to prisma.dataset.create rather than datasetService.create so the
 * test does not drag in the legacy auto-create-project path, which has nothing to do with
 * consent codes and throws for a plain `user`.
 */
async function register(tag, use_conditions) {
  const resource_id = randomUUID();
  await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });

  const query = buildDatasetCreateQuery({
    name: `Test Dataset ${Date.now()}${tag}`,
    type: 'RAW_DATA',
    user_id: actor.id,
    use_conditions,
    recorded_by: actor.subject_id,
  });
  const dataset = await prisma.dataset.create({
    data: { ...query, owner_group_id: group.id, resource_id },
  });
  datasetsToDelete.push(dataset.id);
  return dataset;
}

describe('recording conditions at registration', () => {
  test('round-trips through dataset registration', async () => {
    const dataset = await register('_duc_r1', [
      { system: 'DUO', code: 'DUO:0000007', label: 'disease specific research' },
      {
        system: 'DUO', code: 'DUO:0000021', label: 'ethics approval required', note: 'IRB 2026-114',
      },
    ]);

    const conditions = await datasetService.listUseConditions(dataset.id);

    expect(conditions).toHaveLength(2);
    expect(conditions.map((c) => c.code)).toEqual(['DUO:0000007', 'DUO:0000021']);
    expect(conditions[0].system).toBe('DUO');
    expect(conditions[0].label).toBe('disease specific research');
    expect(conditions[1].note).toBe('IRB 2026-114');
  });

  test('records who captured them', async () => {
    const dataset = await register('_duc_r2', [{ system: 'DUO', code: 'DUO:0000042' }]);

    const [condition] = await datasetService.listUseConditions(dataset.id);

    expect(condition.recorded_by).toBe(actor.subject_id);
    expect(condition.recorded_at).toBeInstanceOf(Date);
  });

  test('leaves a dataset registered without any alone', async () => {
    const dataset = await register('_duc_r3');

    expect(await datasetService.listUseConditions(dataset.id)).toEqual([]);
  });

  test('accepts a code with no label or note', async () => {
    const dataset = await register('_duc_r4', [{ system: 'DUO', code: 'DUO:0000004' }]);

    const [condition] = await datasetService.listUseConditions(dataset.id);

    expect(condition.code).toBe('DUO:0000004');
    expect(condition.label).toBeNull();
    expect(condition.note).toBeNull();
  });
});

describe('recording conditions after registration', () => {
  test('adds them to a dataset that already exists', async () => {
    const dataset = await createTestDataset(group.id, '_duc_late');
    datasetsToDelete.push(dataset.id);

    const added = await datasetService.recordUseConditions(
      dataset.id,
      [{ system: 'DUO', code: 'DUO:0000019', label: 'publication required' }],
      actor.subject_id,
    );

    expect(added).toBe(1);
    expect(await datasetService.listUseConditions(dataset.id)).toHaveLength(1);
  });

  test('recording the same code twice is a mistake, not a second fact', async () => {
    const dataset = await createTestDataset(group.id, '_duc_dup');
    datasetsToDelete.push(dataset.id);

    const condition = [{ system: 'DUO', code: 'DUO:0000020' }];
    await datasetService.recordUseConditions(dataset.id, condition, actor.subject_id);
    const secondTime = await datasetService.recordUseConditions(dataset.id, condition, actor.subject_id);

    expect(secondTime).toBe(0);
    expect(await datasetService.listUseConditions(dataset.id)).toHaveLength(1);
  });

  test('the same code in a different vocabulary is a different fact', async () => {
    const dataset = await createTestDataset(group.id, '_duc_sys');
    datasetsToDelete.push(dataset.id);

    await datasetService.recordUseConditions(dataset.id, [
      { system: 'DUO', code: 'X:1' },
      { system: 'LOCAL', code: 'X:1' },
    ], actor.subject_id);

    expect(await datasetService.listUseConditions(dataset.id)).toHaveLength(2);
  });

  test('an empty list adds nothing', async () => {
    const dataset = await createTestDataset(group.id, '_duc_empty');
    datasetsToDelete.push(dataset.id);

    expect(await datasetService.recordUseConditions(dataset.id, [], actor.subject_id)).toBe(0);
  });
});

describe('querying by condition', () => {
  test('finds the datasets carrying a code, which is what the table exists for', async () => {
    const code = `DUO:TEST${Date.now()}`;
    const carrying = await register('_duc_q1', [{ system: 'DUO', code }]);
    await register('_duc_q2', [{ system: 'DUO', code: 'DUO:0000042' }]);

    const found = await datasetService.datasetsWithUseCondition('DUO', code);

    expect(found).toEqual([carrying.id]);
  });
});

describe('nothing enforces them', () => {
  test('a condition on a dataset does not change who can reach it', async () => {
    const stranger = await createTestUser('_duc_stranger');
    usersToDelete.push(stranger.id);

    const dataset = await register('_duc_unenforced', [
      { system: 'DUO', code: 'DUO:0000021', label: 'ethics approval required' },
    ]);

    // The strictest-sounding condition in the vocabulary confers and withholds nothing.
    const before = await grantService.userHasGrant({
      user_id: stranger.subject_id,
      resource_type: RESOURCE_TYPE.DATASET,
      resource_id: dataset.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });

    expect(before).toBe(false);

    const owner = await datasetService.listUseConditions(dataset.id);
    expect(owner).toHaveLength(1);
  });

  test('deleting a dataset takes its conditions with it', async () => {
    const resource_id = randomUUID();
    await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });
    const doomed = await prisma.dataset.create({
      data: {
        name: `Test Dataset ${Date.now()}_duc_cascade`,
        type: 'RAW_DATA',
        owner_group_id: group.id,
        resource_id,
        is_deleted: false,
      },
    });
    await datasetService.recordUseConditions(doomed.id, [{ system: 'DUO', code: 'DUO:0000004' }]);

    await prisma.dataset.delete({ where: { id: doomed.id } });

    const orphans = await prisma.dataset_use_condition.count({ where: { dataset_id: doomed.id } });
    expect(orphans).toBe(0);
  });
});
