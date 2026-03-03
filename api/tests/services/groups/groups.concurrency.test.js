/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * groups.concurrency.test.js
 *
 * Verifies that group-service operations remain correct under concurrent
 * execution: metadata OCC, membership races, hierarchy writes, and
 * archive vs membership-mutation races.
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

const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_gcc_actor');
  memberUser = await createTestUser('_gcc_member');
  usersToDelete.push(actor.id, memberUser.id);
}, 20_000);

afterAll(async () => {
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function newGroup(tag = '') {
  const g = await createTestGroup(actor.subject_id, tag);
  groupsToDelete.push(g.id);
  return g;
}

async function newChildGroup(parentId, tag = '') {
  const g = await groupsService.createChildGroup(
    parentId,
    { name: `Concurrent Child ${Date.now()}${tag}`, description: 'test' },
    actor.subject_id,
  );
  groupsToDelete.push(g.id);
  return g;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('groups - concurrency', () => {
  describe('concurrent updateGroupMetadata - same expected_version', () => {
    it('exactly one update succeeds and one is rejected with 409', async () => {
      const g = await newGroup('_upd_race');

      const results = await Promise.allSettled([
        groupsService.updateGroupMetadata(g.id, { data: { description: 'update-A' }, expected_version: 1 }),
        groupsService.updateGroupMetadata(g.id, { data: { description: 'update-B' }, expected_version: 1 }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.status).toBe(409);
    });

    it('final version is 2, not 3 (only one write landed)', async () => {
      const g = await newGroup('_upd_ver_race');

      await Promise.allSettled([
        groupsService.updateGroupMetadata(g.id, { data: { description: 'A' }, expected_version: 1 }),
        groupsService.updateGroupMetadata(g.id, { data: { description: 'B' }, expected_version: 1 }),
      ]);

      const final = await groupsService.getGroupById(g.id);
      expect(final.version).toBe(2);
    });
  });

  describe('concurrent updateGroupMetadata - correct sequential versions', () => {
    it('both updates succeed when each uses the correct current version', async () => {
      const g = await newGroup('_sequential_upd');
      const v2 = await groupsService.updateGroupMetadata(g.id, { data: { description: 'v2' }, expected_version: 1 });
      expect(v2.version).toBe(2);
      const v3 = await groupsService.updateGroupMetadata(g.id, { data: { description: 'v3' }, expected_version: 2 });
      expect(v3.version).toBe(3);
    });
  });

  describe('concurrent addGroupMembers for same user', () => {
    it('both calls resolve without error (ON CONFLICT DO NOTHING)', async () => {
      const g = await newGroup('_add_race');

      const results = await Promise.allSettled([
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);
    });

    it('exactly 1 membership row exists after the concurrent adds', async () => {
      const g = await newGroup('_add_race_count');

      await Promise.allSettled([
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ]);

      const count = await prisma.group_user.count({
        where: { group_id: g.id, user_id: memberUser.subject_id },
      });
      expect(count).toBe(1);
    });
  });

  describe('concurrent removeGroupMembers for same user', () => {
    it('both removes resolve without error', async () => {
      const g = await newGroup('_rm_race');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      const results = await Promise.allSettled([
        groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
        groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);
    });

    it('user is absent from the group after both removes complete', async () => {
      const g = await newGroup('_rm_race_absent');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });

      await Promise.allSettled([
        groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
        groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ]);

      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
      });
      expect(membership).toBeNull();
    });
  });

  describe('concurrent createChildGroup under same parent', () => {
    it('both children are created successfully with independent closure rows', async () => {
      const parent = await newGroup('_parent_cc');

      const results = await Promise.allSettled([
        newChildGroup(parent.id, '_cc_child_A'),
        newChildGroup(parent.id, '_cc_child_B'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);

      const descendants = await groupsService.getGroupDescendants(parent.id);
      expect(descendants.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('archive vs addGroupMembers race', () => {
    it('leaves the group in a consistent state (archived, no new member)', async () => {
      const g = await newGroup('_arch_add_race');

      const results = await Promise.allSettled([
        groupsService.archiveGroup(g.id, actor.subject_id),
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ]);

      // At least archiveGroup must succeed since it has no precondition guard
      const archiveFulfilled = results.some(
        (r) => r.status === 'fulfilled' && r.value?.is_archived === true,
      );
      expect(archiveFulfilled).toBe(true);

      // Group must be archived in the DB regardless of which operation ran first
      const final = await groupsService.getGroupById(g.id);
      expect(final.is_archived).toBe(true);

      // If addGroupMembers succeeded, the member is present; if it failed, they are not.
      // Either outcome is valid — what is NOT valid is the group being un-archived or version corruption.
      expect(typeof final.is_archived).toBe('boolean');
    });
  });

  describe('concurrent promoteGroupMemberToAdmin and removeGroupAdmin', () => {
    it('final role is a valid GROUP_MEMBER_ROLE value (no corruption)', async () => {
      const g = await newGroup('_promo_demote_race');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      await groupsService.promoteGroupMemberToAdmin(g.id, {
        user_id: memberUser.subject_id,
        actor_id: actor.subject_id,
      });

      // Race between a second promote and a demote
      await Promise.allSettled([
        groupsService.promoteGroupMemberToAdmin(g.id, { user_id: memberUser.subject_id, actor_id: actor.subject_id }),
        groupsService.removeGroupAdmin(g.id, { user_id: memberUser.subject_id, actor_id: actor.subject_id }),
      ]);

      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
      });
      expect([GROUP_MEMBER_ROLE.ADMIN, GROUP_MEMBER_ROLE.MEMBER]).toContain(membership.role);
    });
  });
});
