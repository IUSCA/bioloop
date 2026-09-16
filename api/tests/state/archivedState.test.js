/**
 * archivedState.test.js
 *
 * What archiving does in the database, for the facts a pure rule cannot state.
 *
 * `rules.test.js` drives every state rule as a pure function, and
 * `serviceStateChecks.test.js` covers the 409 each service returns. What is left, and what
 * needs real rows, is the reach of an archived group: it covers the group itself and the
 * resources it owns, and it stops there. A sub-group keeps its own state, and so do the
 * datasets that sub-group owns.
 *
 * That last case is the one worth a database. Reading it off the rules is circular, because
 * the rules are written to read one step; only a real group tree shows that nothing propagates.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const state = require('@/state');
const groupsService = require('@/services/groups');
const { readDatasetStateFields } = require('@/services/datasets_v2/stateFields');
const {
  createTestUser, createTestGroup, createTestChildGroup, createTestDataset,
  deleteDataset, deleteGroup, deleteUser,
} = require('../services/helpers');

let actor;
let parent;
let child;
let parentDataset;
let childDataset;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_arch_actor');
  usersToDelete.push(actor.id);

  parent = await createTestGroup(actor.subject_id, '_arch_parent');
  groupsToDelete.push(parent.id);
  child = await createTestChildGroup(parent.id, actor.subject_id, '_arch_child');
  groupsToDelete.push(child.id);

  parentDataset = await createTestDataset(parent.id, '_arch_pds');
  childDataset = await createTestDataset(child.id, '_arch_cds');
  datasetsToDelete.push(parentDataset.id, childDataset.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) await deleteDataset(id).catch(() => {});
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

/** The group row its own rules read. */
const groupRow = (id) => prisma.group.findUniqueOrThrow({
  where: { id }, select: { is_archived: true },
});

describe('an archived group', () => {
  beforeAll(async () => {
    await groupsService.archiveGroup(parent.id, actor.subject_id);
  }, 20_000);

  afterAll(async () => {
    await groupsService.unarchiveGroup(parent.id, actor.subject_id);
  }, 20_000);

  test('writes the archived column, which is what every reader consults', async () => {
    const row = await prisma.group.findUniqueOrThrow({
      where: { id: parent.id }, select: { is_archived: true, archived_at: true },
    });
    expect(row.is_archived).toBe(true);
    expect(row.archived_at).not.toBeNull();
  });

  test('refuses a change to itself and admits every read', async () => {
    const row = await groupRow(parent.id);
    expect(state.check('group', 'edit_metadata', row)).not.toBeNull();
    expect(state.check('group', 'add_member', row)).not.toBeNull();
    expect(state.check('group', 'view_metadata', row)).toBeNull();
    expect(state.check('group', 'view_members', row)).toBeNull();
  });

  test('refuses changes to the datasets it owns, and leaves their bytes readable', async () => {
    const row = await readDatasetStateFields(prisma, parentDataset.id);
    expect(state.check('dataset', 'edit_metadata', row)).not.toBeNull();
    expect(state.check('dataset', 'transfer_ownership', row)).not.toBeNull();
    // Archiving closes governance, not access. @see decision 16, row 4
    expect(state.check('dataset', 'download', row)).toBeNull();
    expect(state.check('dataset', 'view_metadata', row)).toBeNull();
  });

  test('leaves its sub-group mutable, and the datasets that sub-group owns', async () => {
    // The D2 case. An archived group does not archive the groups beneath it: somebody archives
    // each one in its own right, and until they do, the sub-group governs itself.
    expect(state.check('group', 'add_member', await groupRow(child.id))).toBeNull();

    const row = await readDatasetStateFields(prisma, childDataset.id);
    expect(state.check('dataset', 'edit_metadata', row)).toBeNull();
  });

  test('admits unarchiving, or the group would be stuck', async () => {
    expect(state.check('group', 'unarchive', await groupRow(parent.id))).toBeNull();
    // Forced unless the two differ: an active group refuses unarchive, so the rule is reading
    // the column rather than always admitting the way out.
    expect(state.check('group', 'unarchive', { is_archived: false })).not.toBeNull();
  });
});

describe('unarchiving', () => {
  test('restores changes to the group and to what it owns', async () => {
    const g = await createTestGroup(actor.subject_id, '_arch_lift');
    groupsToDelete.push(g.id);
    const d = await createTestDataset(g.id, '_arch_lift_ds');
    datasetsToDelete.push(d.id);

    await groupsService.archiveGroup(g.id, actor.subject_id);
    expect(state.check('group', 'edit_metadata', await groupRow(g.id))).not.toBeNull();
    expect(state.check('dataset', 'edit_metadata', await readDatasetStateFields(prisma, d.id)))
      .not.toBeNull();

    await groupsService.unarchiveGroup(g.id, actor.subject_id);
    expect(state.check('group', 'edit_metadata', await groupRow(g.id))).toBeNull();
    expect(state.check('dataset', 'edit_metadata', await readDatasetStateFields(prisma, d.id)))
      .toBeNull();
  }, 30_000);

  test('an unrelated group is never reached either way', async () => {
    const unrelated = await createTestGroup(actor.subject_id, '_arch_unrelated');
    groupsToDelete.push(unrelated.id);
    expect(state.check('group', 'edit_metadata', await groupRow(unrelated.id))).toBeNull();
  });
});
