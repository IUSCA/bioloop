/**
 * groups.lifecycle.test.js
 *
 * Tests the full lifecycle of groups, child groups, members, and metadata updates.
 * Covers: creation, closure-table correctness, metadata updates, archive/unarchive,
 * membership management, and admin promotion / demotion.
 */

const path = require('path');
const { GROUP_MEMBER_ROLE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const {
  createTestUser,
  createTestGroup,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let memberUser;

// Groups and users created per-test are pushed here for cleanup.
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_grl_actor');
  memberUser = await createTestUser('_grl_member');
  usersToDelete.push(actor.id, memberUser.id);
}, 20_000);

afterAll(async () => {
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {}); // ignore if already deleted
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function newGroup(tag = '', overrides = {}) {
  const g = await createTestGroup(actor.subject_id, tag, overrides);
  groupsToDelete.push(g.id);
  return g;
}

async function newChildGroup(parentId, tag = '') {
  const g = await groupsService.createChildGroup(
    parentId,
    { name: `Test Child ${Date.now()}${tag}`, description: 'child' },
    actor.subject_id,
  );
  groupsToDelete.push(g.id);
  return g;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('groups - lifecycle', () => {
  describe('createGroup', () => {
    it('creates a self-closure row with depth 0', async () => {
      const g = await newGroup('_create');
      const selfRow = await prisma.group_closure.findUnique({
        where: { ancestor_id_descendant_id: { ancestor_id: g.id, descendant_id: g.id } },
      });
      expect(selfRow).not.toBeNull();
      expect(selfRow.depth).toBe(0);
    });

    it('creates exactly one closure row (the self-row)', async () => {
      const g = await newGroup('_create_count');
      const rows = await prisma.group_closure.findMany({ where: { ancestor_id: g.id } });
      expect(rows).toHaveLength(1);
    });

    it('creates a GROUP_CREATED audit row', async () => {
      const g = await newGroup('_audit');
      const auditRow = await prisma.authorization_audit.findFirst({
        where: { event_type: 'GROUP_CREATED', target_type: 'group', target_id: g.id },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow.actor_id).toBe(actor.subject_id);
    });

    it('returned group has version = 1', async () => {
      const g = await newGroup('_version');
      expect(g.version).toBe(1);
    });

    it('returned group has is_archived = false', async () => {
      const g = await newGroup('_arch_init');
      expect(g.is_archived).toBe(false);
    });
  });

  describe('createChildGroup', () => {
    it('creates a direct closure row (parent → child, depth=1)', async () => {
      const parent = await newGroup('_parent');
      const child = await newChildGroup(parent.id, '_child');

      const row = await prisma.group_closure.findUnique({
        where: { ancestor_id_descendant_id: { ancestor_id: parent.id, descendant_id: child.id } },
      });
      expect(row).not.toBeNull();
      expect(row.depth).toBe(1);
    });

    it('creates transitive closure for 3 levels (grandparent → grandchild, depth=2)', async () => {
      const grandparent = await newGroup('_gp');
      const parent = await newChildGroup(grandparent.id, '_p');
      const child = await newChildGroup(parent.id, '_c');

      const row = await prisma.group_closure.findUnique({
        where: {
          ancestor_id_descendant_id: { ancestor_id: grandparent.id, descendant_id: child.id },
        },
      });
      expect(row).not.toBeNull();
      expect(row.depth).toBe(2);
    });

    it('getGroupDescendants returns child groups', async () => {
      const parent = await newGroup('_desc_parent');
      const child = await newChildGroup(parent.id, '_desc_child');

      const descendants = await groupsService.getGroupDescendants(parent.id);
      const ids = descendants.map((d) => d.id);
      expect(ids).toContain(child.id);
    });

    it('getGroupAncestors returns parent groups', async () => {
      const parent = await newGroup('_anc_parent');
      const child = await newChildGroup(parent.id, '_anc_child');

      const ancestors = await groupsService.getGroupAncestors(child.id);
      const ids = ancestors.map((a) => a.id);
      expect(ids).toContain(parent.id);
    });

    it('actor is automatically added as ADMIN member of child group', async () => {
      const parent = await newGroup('_auto_admin_parent');
      const child = await newChildGroup(parent.id, '_auto_admin_child');

      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: child.id, user_id: actor.subject_id } },
      });
      expect(membership).not.toBeNull();
      expect(membership.role).toBe(GROUP_MEMBER_ROLE.ADMIN);
    });
  });

  describe('updateGroupMetadata', () => {
    it('successfully updates with the correct expected_version', async () => {
      const g = await newGroup('_upd');
      const updated = await groupsService.updateGroupMetadata(g.id, {
        data: { description: 'updated description' },
        expected_version: 1,
      });
      expect(updated.description).toBe('updated description');
    });

    it('version increments by 1 on each write', async () => {
      const g = await newGroup('_ver_inc');
      const v2 = await groupsService.updateGroupMetadata(g.id, {
        data: { description: 'v2' },
        expected_version: 1,
      });
      expect(v2.version).toBe(2);

      const v3 = await groupsService.updateGroupMetadata(g.id, {
        data: { description: 'v3' },
        expected_version: 2,
      });
      expect(v3.version).toBe(3);
    });

    it('throws 409 Conflict when expected_version is stale', async () => {
      const g = await newGroup('_occ');
      // bump to v2
      await groupsService.updateGroupMetadata(g.id, { data: { description: 'v2' }, expected_version: 1 });

      // passing v1 again should fail
      await expect(
        groupsService.updateGroupMetadata(g.id, { data: { description: 'stale' }, expected_version: 1 }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('name change regenerates slug', async () => {
      const g = await newGroup('_slug');
      const newName = `Renamed Group ${Date.now()}`;
      const updated = await groupsService.updateGroupMetadata(g.id, {
        data: { name: newName },
        expected_version: 1,
      });
      expect(updated.slug).not.toBe(g.slug);
      expect(updated.name).toBe(newName);
    });

    it('metadata is deep-merged, not replaced', async () => {
      const g = await newGroup('_merge', { metadata: { type: 'lab', pi: 'Alice' } });
      const updated = await groupsService.updateGroupMetadata(g.id, {
        data: { metadata: { tags: ['genomics'] } },
        expected_version: 1,
      });
      expect(updated.metadata.pi).toBe('Alice');
      expect(updated.metadata.type).toBe('lab');
      expect(updated.metadata.tags).toEqual(['genomics']);
    });

    it('throws on archived group regardless of version', async () => {
      const g = await newGroup('_arch_upd');
      await groupsService.archiveGroup(g.id, actor.subject_id);
      await expect(
        groupsService.updateGroupMetadata(g.id, { data: { description: 'new' }, expected_version: 1 }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('archiveGroup / unarchiveGroup', () => {
    it('archiveGroup sets is_archived=true and archived_at', async () => {
      const g = await newGroup('_archive');
      const archived = await groupsService.archiveGroup(g.id, actor.subject_id);
      expect(archived.is_archived).toBe(true);
      expect(archived.archived_at).not.toBeNull();
    });

    it('unarchiveGroup sets is_archived=false and clears archived_at', async () => {
      const g = await newGroup('_unarchive');
      await groupsService.archiveGroup(g.id, actor.subject_id);
      const restored = await groupsService.unarchiveGroup(g.id, actor.subject_id);
      expect(restored.is_archived).toBe(false);
      expect(restored.archived_at).toBeNull();
    });

    it('archiveGroup creates a GROUP_ARCHIVED audit row', async () => {
      const g = await newGroup('_arch_audit');
      await groupsService.archiveGroup(g.id, actor.subject_id);
      const audit = await prisma.authorization_audit.findFirst({
        where: { event_type: 'GROUP_ARCHIVED', target_type: 'group', target_id: g.id },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('membership management', () => {
    it('addGroupMembers adds user with role MEMBER', async () => {
      const g = await newGroup('_add_member');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
      });
      expect(membership).not.toBeNull();
      expect(membership.role).toBe(GROUP_MEMBER_ROLE.MEMBER);
    });

    it('addGroupMembers is idempotent', async () => {
      const g = await newGroup('_add_idem');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      // Second call must not throw and must not create a duplicate row
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      const count = await prisma.group_user.count({
        where: { group_id: g.id, user_id: memberUser.subject_id },
      });
      expect(count).toBe(1);
    });

    it('listGroupMembers reflects added members', async () => {
      const g = await newGroup('_list_members');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      const result = await groupsService.listGroupMembers(g.id, { limit: 10, offset: 0 });
      const userIds = result.data.map((m) => m.user_id);
      expect(userIds).toContain(memberUser.subject_id);
    });

    it('removeGroupMembers removes the user', async () => {
      const g = await newGroup('_rm_member');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      await groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
      });
      expect(membership).toBeNull();
    });

    it('listGroupMembers total is correct after add and remove', async () => {
      const g = await newGroup('_count_members');
      const extraUser = await createTestUser('_member_extra');
      usersToDelete.push(extraUser.id);

      await groupsService.addGroupMembers(g.id, {
        user_ids: [memberUser.subject_id, extraUser.subject_id],
        actor_id: actor.subject_id,
      });
      let result = await groupsService.listGroupMembers(g.id, { limit: 10, offset: 0 });
      expect(result.metadata.total).toBe(2);

      await groupsService.removeGroupMembers(g.id, {
        user_ids: [extraUser.subject_id],
        actor_id: actor.subject_id,
      });
      result = await groupsService.listGroupMembers(g.id, { limit: 10, offset: 0 });
      expect(result.metadata.total).toBe(1);
    });
  });

  describe('promoteGroupMemberToAdmin / removeGroupAdmin', () => {
    it('promotion changes role to ADMIN', async () => {
      const g = await newGroup('_promote');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      const result = await groupsService.promoteGroupMemberToAdmin(g.id, {
        user_id: memberUser.subject_id, actor_id: actor.subject_id,
      });
      expect(result.role).toBe(GROUP_MEMBER_ROLE.ADMIN);
    });

    it('demotion changes role back to MEMBER', async () => {
      const g = await newGroup('_demote');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      await groupsService.promoteGroupMemberToAdmin(g.id, {
        user_id: memberUser.subject_id,
        actor_id: actor.subject_id,
      });
      const result = await groupsService.removeGroupAdmin(g.id, {
        user_id: memberUser.subject_id,
        actor_id: actor.subject_id,
      });
      expect(result.role).toBe(GROUP_MEMBER_ROLE.MEMBER);
    });

    it('promoting a non-member throws 409', async () => {
      const g = await newGroup('_promote_nonmember');
      await expect(
        groupsService.promoteGroupMemberToAdmin(g.id, { user_id: memberUser.subject_id, actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('getGroupById', () => {
    it('returns the correct group', async () => {
      const g = await newGroup('_get_by_id');
      const fetched = await groupsService.getGroupById(g.id);
      expect(fetched.id).toBe(g.id);
      expect(fetched.name).toBe(g.name);
    });
  });
});
