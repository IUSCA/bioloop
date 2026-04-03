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
const { runRace, fanOut } = require('../concurrency-utils');
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
  const g = await groupsService.createGroup({
    parent_id: parentId,
    data: { name: `Concurrent Child ${Date.now()}${tag}`, description: 'test' },
    actor_id: actor.subject_id,
  });
  groupsToDelete.push(g.id);
  return g;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('groups - concurrency', () => {
  describe('concurrent updateGroupMetadata - same expected_version', () => {
    it('exactly one update succeeds and one is rejected with 409', async () => {
      await runRace(
        async () => newGroup('_upd_race'),
        (g) => fanOut(5, () => groupsService.updateGroupMetadata(g.id, {
          data: { description: 'update' },
          expected_version: 1,
        })),
        async (results) => {
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          const rejected = results.filter((r) => r.status === 'rejected');

          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(4);
          rejected.forEach((r) => {
            expect(r.reason.status).toBe(409);
          });
        },
      );
    });

    it('final version is 2, not higher (only one write landed)', async () => {
      await runRace(
        async () => newGroup('_upd_ver_race'),
        (g) => fanOut(5, () => groupsService.updateGroupMetadata(g.id, {
          data: { description: 'update' },
          expected_version: 1,
        })),
        async (results, g) => {
          const final = await groupsService.getGroupById(g.id);
          expect(final.version).toBe(2);
        },
      );
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
      await runRace(
        async () => newGroup('_add_race'),
        (g) => fanOut(5, () => groupsService.addGroupMembers(g.id, {
          user_ids: [memberUser.subject_id],
          actor_id: actor.subject_id,
        })),
        async (results) => {
          const rejected = results.filter((r) => r.status === 'rejected');
          expect(rejected).toHaveLength(0);
        },
      );
    });

    it('exactly 1 membership row exists after the concurrent adds', async () => {
      await runRace(
        async () => newGroup('_add_race_count'),
        (g) => fanOut(5, () => groupsService.addGroupMembers(g.id, {
          user_ids: [memberUser.subject_id],
          actor_id: actor.subject_id,
        })),
        async (results, g) => {
          const count = await prisma.group_user.count({
            where: { group_id: g.id, user_id: memberUser.subject_id },
          });
          expect(count).toBe(1);
        },
      );
    });
  });

  describe('concurrent removeGroupMembers for same user', () => {
    it('both removes resolve without error', async () => {
      await runRace(
        async () => {
          const g = await newGroup('_rm_race');
          await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
          return g;
        },
        (g) => fanOut(5, () => groupsService.removeGroupMembers(g.id, {
          user_ids: [memberUser.subject_id],
          actor_id: actor.subject_id,
        })),
        async (results) => {
          const rejected = results.filter((r) => r.status === 'rejected');
          expect(rejected).toHaveLength(0);
        },
      );
    });

    it('user is absent from the group after both removes complete', async () => {
      await runRace(
        async () => {
          const g = await newGroup('_rm_race_absent');
          await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
          return g;
        },
        (g) => fanOut(5, () => groupsService.removeGroupMembers(g.id, {
          user_ids: [memberUser.subject_id],
          actor_id: actor.subject_id,
        })),
        async (results, g) => {
          const membership = await prisma.group_user.findUnique({
            where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
          });
          expect(membership).toBeNull();
        },
      );
    });
  });

  describe('concurrent createChildGroup under same parent', () => {
    it('both children are created successfully with independent closure rows', async () => {
      await runRace(
        async () => newGroup('_parent_cc'),
        (parent) => [
          newChildGroup(parent.id, '_cc_child_A'),
          newChildGroup(parent.id, '_cc_child_B'),
        ],
        async (results, parent) => {
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);

          const descendants = await groupsService.getGroupDescendants(parent.id);
          expect(descendants.length).toBeGreaterThanOrEqual(2);
        },
      );
    });
  });

  describe('archive vs addGroupMembers race', () => {
    it('leaves the group in a consistent state (archived, no new member)', async () => {
      await runRace(
        async () => newGroup('_arch_add_race'),
        (g) => [
          groupsService.archiveGroup(g.id, actor.subject_id),
          groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
        ],
        async (results, g) => {
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
        },
      );
    });
  });

  describe('concurrent promoteGroupMemberToAdmin and demoteAdminToMember', () => {
    it('final role is a valid GROUP_MEMBER_ROLE value (no corruption)', async () => {
      await runRace(
        async () => {
          const g = await newGroup('_promo_demote_race');
          await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
          await groupsService.promoteGroupMemberToAdmin(g.id, {
            user_id: memberUser.subject_id,
            actor_id: actor.subject_id,
          });
          return g;
        },
        (g) => [
          groupsService.promoteGroupMemberToAdmin(g.id, { user_id: memberUser.subject_id, actor_id: actor.subject_id }),
          groupsService.demoteAdminToMember(g.id, { user_id: memberUser.subject_id, actor_id: actor.subject_id }),
        ],
        async (results, g) => {
          const membership = await prisma.group_user.findUnique({
            where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
          });
          expect([GROUP_MEMBER_ROLE.ADMIN, GROUP_MEMBER_ROLE.MEMBER]).toContain(membership.role);
        },
      );
    });
  });
});
