/**
 * restrictions.test.js
 *
 * The restriction layer: allowed = no restriction blocks this AND some grant permits it.
 *
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');
const restrictionService = require('@/services/restrictions');
const { policyRegistry, restrictions } = require('@/authorization');

const {
  RESTRICTION_TYPES,
  typeBlocks,
  blockedActions,
  blockingRestriction,
  effectiveRestrictionTypes,
} = restrictions;
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let parent;
let child;
let parentDataset;
let childDataset;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_res_actor');
  usersToDelete.push(actor.id);

  parent = await createTestGroup(actor.subject_id, '_res_parent');
  groupsToDelete.push(parent.id);
  child = await groupsService.createGroup({
    data: { name: `Test Child ${Date.now()}_res`, allow_user_contributions: false },
    actor_id: actor.subject_id,
    parent_id: parent.id,
  });
  groupsToDelete.push(child.id);

  parentDataset = await createTestDataset(parent.id, '_res_pds');
  childDataset = await createTestDataset(child.id, '_res_cds');
  datasetsToDelete.push(parentDataset.id, childDataset.id);
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

describe('the action classification', () => {
  const rows = () => policyRegistry.listTypes().flatMap((resourceType) => {
    const container = policyRegistry.get(resourceType);
    return container.getActionNames().map((action) => ({
      qualified: `${resourceType}.${action}`, action, restriction: container.getRestrictionClass(action),
    }));
  });

  // Every registered container, so one a derived app adds is covered without editing this file.
  test('ARCHIVED blocks every mutation except unarchive, and nothing else', () => {
    const expected = rows().filter((r) => r.restriction === 'mutating' && r.action !== 'unarchive')
      .map((r) => r.qualified);
    expect(blockedActions('ARCHIVED').sort()).toEqual(expected.sort());
    // Forced unless both classes occur: a registry of mutations alone would pass trivially.
    expect(rows().some((r) => r.restriction === 'reading')).toBe(true);
  });

  test('DELETED also blocks reading the bytes, and still leaves reading the record', () => {
    expect(typeBlocks('DELETED', 'dataset.download')).toBe(true);
    expect(typeBlocks('DELETED', 'dataset.list_files')).toBe(true);
    expect(typeBlocks('DELETED', 'dataset.edit_metadata')).toBe(true);
    expect(typeBlocks('DELETED', 'dataset.view_metadata')).toBe(false);
    expect(typeBlocks('ARCHIVED', 'dataset.download')).toBe(false);
  });

  test('every exemption names a registered mutation', () => {
    Object.values(RESTRICTION_TYPES).forEach(({ exempt }) => exempt.forEach((action) => {
      const holders = rows().filter((r) => r.action === action);
      expect([action, holders.length > 0]).toEqual([action, true]);
      holders.forEach((r) => expect([r.qualified, r.restriction]).toEqual([r.qualified, 'mutating']));
    }));
  });

  test('an action no container registers is an error, not an allowance', () => {
    expect(() => typeBlocks('ARCHIVED', 'dataset.no_such_action')).toThrow();
  });
});

describe('an archived group', () => {
  beforeAll(async () => {
    await groupsService.archiveGroup(parent.id, actor.subject_id);
  }, 20_000);

  afterAll(async () => {
    await groupsService.unarchiveGroup(parent.id, actor.subject_id);
  }, 20_000);

  test('writes a restriction row alongside is_archived', async () => {
    const open = await prisma.restriction.findMany({
      where: { group_id: parent.id, lifted_at: null },
    });

    expect(open).toHaveLength(1);
    expect(open[0].type_name).toBe('ARCHIVED');
    expect(open[0].applied_by).toBe(actor.subject_id);
  });

  test('blocks a mutation on the group itself', async () => {
    const blocked = await blockingRestriction('group', 'edit_metadata', { group_id: parent.id });

    expect(blocked).toBe('ARCHIVED');
  });

  test('leaves reading alone', async () => {
    const blocked = await blockingRestriction('group', 'view_metadata', { group_id: parent.id });

    expect(blocked).toBeNull();
  });

  test('reaches its descendant groups', async () => {
    const blocked = await blockingRestriction('group', 'add_member', { group_id: child.id });

    expect(blocked).toBe('ARCHIVED');
  });

  test('reaches the datasets it governs', async () => {
    const blocked = await blockingRestriction('dataset', 'edit_metadata', {
      resource_id: parentDataset.resource_id,
    });

    expect(blocked).toBe('ARCHIVED');
  });

  test('reaches the datasets its descendants govern', async () => {
    const blocked = await blockingRestriction('dataset', 'edit_metadata', {
      resource_id: childDataset.resource_id,
    });

    expect(blocked).toBe('ARCHIVED');
  });

  test('does not block reading a dataset it governs', async () => {
    const blocked = await blockingRestriction('dataset', 'download', {
      resource_id: parentDataset.resource_id,
    });

    expect(blocked).toBeNull();
  });

  test('does not block unarchiving, or the resource would be stuck', async () => {
    const blocked = await blockingRestriction('group', 'unarchive', { group_id: parent.id });

    expect(blocked).toBeNull();
  });

  test('blocks transferring a dataset out of it', async () => {
    // Archiving is a boundary closure: a platform admin unarchives, reassigns, and
    // re-archives, which leaves an audit record of each step.
    const blocked = await blockingRestriction('dataset', 'transfer_ownership', {
      resource_id: parentDataset.resource_id,
    });

    expect(blocked).toBe('ARCHIVED');
  });

  test('blocks revoking a grant on its resources, as the archive dialog promises', async () => {
    const blocked = await blockingRestriction('grant', 'revoke', {
      resource_id: parentDataset.resource_id,
    });

    expect(blocked).toBe('ARCHIVED');
  });

  test('does not reach an unrelated group', async () => {
    const unrelated = await createTestGroup(actor.subject_id, '_res_unrelated');
    groupsToDelete.push(unrelated.id);

    const blocked = await blockingRestriction('group', 'edit_metadata', { group_id: unrelated.id });

    expect(blocked).toBeNull();
  });
});

describe('lifting a restriction', () => {
  test('restores mutation and closes the row rather than deleting it', async () => {
    const g = await createTestGroup(actor.subject_id, '_res_lift');
    groupsToDelete.push(g.id);

    await groupsService.archiveGroup(g.id, actor.subject_id);
    expect(await blockingRestriction('group', 'edit_metadata', { group_id: g.id })).toBe('ARCHIVED');

    await groupsService.unarchiveGroup(g.id, actor.subject_id);
    expect(await blockingRestriction('group', 'edit_metadata', { group_id: g.id })).toBeNull();

    const history = await restrictionService.restrictionHistory({ group_id: g.id });
    expect(history).toHaveLength(1);
    expect(history[0].lifted_at).not.toBeNull();
    expect(history[0].lifted_by).toBe(actor.subject_id);
  });

  test('re-archiving opens a second row rather than reviving the first', async () => {
    const g = await createTestGroup(actor.subject_id, '_res_reopen');
    groupsToDelete.push(g.id);

    await groupsService.archiveGroup(g.id, actor.subject_id);
    await groupsService.unarchiveGroup(g.id, actor.subject_id);
    await groupsService.archiveGroup(g.id, actor.subject_id);

    const history = await restrictionService.restrictionHistory({ group_id: g.id });
    expect(history).toHaveLength(2);
    expect(history.filter((r) => r.lifted_at === null)).toHaveLength(1);
  });

  test('archiving twice does not open a duplicate', async () => {
    const g = await createTestGroup(actor.subject_id, '_res_dup');
    groupsToDelete.push(g.id);

    await groupsService.archiveGroup(g.id, actor.subject_id);
    // The service refuses a second archive, so go straight at the restriction to prove the
    // partial unique index is what makes it idempotent.
    await restrictionService.applyRestriction(prisma, {
      type_name: 'ARCHIVED',
      group_id: g.id,
      actor_id: actor.subject_id,
    });

    const open = await prisma.restriction.findMany({ where: { group_id: g.id, lifted_at: null } });
    expect(open).toHaveLength(1);
  });
});

describe('an archived collection', () => {
  test('carries a restriction on its own resource id and blocks its mutations', async () => {
    const g = await createTestGroup(actor.subject_id, '_res_coll_group');
    groupsToDelete.push(g.id);
    const collection = await collectionsService.createCollection({
      name: `Test Collection ${Date.now()}_res`,
      owner_group_id: g.id,
    }, { actor_id: actor.subject_id });

    await collectionsService.archiveCollection(collection.id, actor.subject_id);

    const types = await effectiveRestrictionTypes({ resource_id: collection.id });
    expect(types).toContain('ARCHIVED');

    expect(await blockingRestriction('collection', 'edit_metadata', {
      resource_id: collection.id,
    })).toBe('ARCHIVED');
    expect(await blockingRestriction('collection', 'view_metadata', {
      resource_id: collection.id,
    })).toBeNull();

    await prisma.restriction.deleteMany({ where: { resource_id: collection.id } });
    // grant.resource is onDelete: Restrict and every collection carries the owning group's
    // seeded grant, so the grants go first.
    await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
    await prisma.collection.deleteMany({ where: { id: collection.id } });
  });
});

describe('the denormalised is_archived column', () => {
  test('agrees with the restriction table for every group and collection', async () => {
    const archivedGroups = await prisma.group.findMany({
      where: { is_archived: true }, select: { id: true },
    });
    const restrictedGroups = await prisma.restriction.findMany({
      where: { type_name: 'ARCHIVED', lifted_at: null, group_id: { not: null } },
      select: { group_id: true },
    });

    expect(new Set(restrictedGroups.map((r) => r.group_id)))
      .toEqual(new Set(archivedGroups.map((g) => g.id)));

    const archivedCollections = await prisma.collection.findMany({
      where: { is_archived: true }, select: { id: true },
    });
    const restrictedResources = await prisma.restriction.findMany({
      where: { type_name: 'ARCHIVED', lifted_at: null, resource_id: { not: null } },
      select: { resource_id: true },
    });

    expect(new Set(restrictedResources.map((r) => r.resource_id)))
      .toEqual(new Set(archivedCollections.map((c) => c.id)));
  });
});
