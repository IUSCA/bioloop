/**
 * groups.hierarchy.test.js
 *
 * Tests for the getGroupHierarchy helper.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup,
} = require('../helpers');

let actor;

// Groups and users created per-test are pushed here for cleanup.
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_gh_actor');
  usersToDelete.push(actor.id);
}, 20_000);

afterAll(async () => {
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('groups - getGroupHierarchy', () => {
  it('returns a nested hierarchy of matching groups', async () => {
    const prefix = `hierarchy_test_${Date.now()}`;
    const root = await createTestGroup(actor.subject_id, `${prefix}_root`);
    const child = await groupsService.createGroup({
      parent_id: root.id,
      data: { name: `${prefix}_child` },
      actor_id: actor.subject_id,
    });

    groupsToDelete.push(root.id, child.id);

    const results = await groupsService.getGroupHierarchy({ search_term: prefix });
    const fetchedRoot = results.find((g) => g.id === root.id);

    expect(fetchedRoot).toBeDefined();
    expect(Array.isArray(fetchedRoot._children)).toBe(true);
    expect(fetchedRoot._children.map((c) => c.id)).toContain(child.id);
  });

  it('supports pagination of root groups', async () => {
    const prefix = `hierarchy_pagination_${Date.now()}`;
    const roots = [];
    for (const suffix of ['a', 'b', 'c']) {
      const g = await createTestGroup(actor.subject_id, `${prefix}_${suffix}`);
      groupsToDelete.push(g.id);
      roots.push(g);
    }

    const page0 = await groupsService.getGroupHierarchy({
      search_term: prefix,
      root_limit: 1,
      root_offset: 0,
    });
    const page1 = await groupsService.getGroupHierarchy({
      search_term: prefix,
      root_limit: 1,
      root_offset: 1,
    });

    expect(page0).toHaveLength(1);
    expect(page1).toHaveLength(1);
    expect(page0[0].id).not.toBe(page1[0].id);
    const createdIds = roots.map((r) => r.id);
    expect(createdIds).toContain(page0[0].id);
    expect(createdIds).toContain(page1[0].id);
  });

  it('filters results by archived status', async () => {
    const prefix = `hierarchy_archived_${Date.now()}`;
    const active = await createTestGroup(actor.subject_id, `${prefix}_active`);
    const archived = await createTestGroup(actor.subject_id, `${prefix}_archived`);

    groupsToDelete.push(active.id, archived.id);

    await groupsService.archiveGroup(archived.id, actor.subject_id);

    const activeResults = await groupsService.getGroupHierarchy({
      search_term: prefix,
      is_archived: false,
    });
    const archivedResults = await groupsService.getGroupHierarchy({
      search_term: prefix,
      is_archived: true,
    });

    expect(activeResults.some((g) => g.id === active.id)).toBe(true);
    expect(activeResults.some((g) => g.id === archived.id)).toBe(false);

    expect(archivedResults.some((g) => g.id === archived.id)).toBe(true);
    expect(archivedResults.some((g) => g.id === active.id)).toBe(false);
  });

  it('returns empty array when no groups match search term', async () => {
    const randomSearch = `no_match_${Date.now()}_${Math.random()}`;
    const results = await groupsService.getGroupHierarchy({ search_term: randomSearch });
    expect(results).toEqual([]);
  });
});
