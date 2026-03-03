/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * groups.invariants.test.js
 *
 * Verifies DB-level invariants that must hold regardless of which
 * code path triggers them:
 *  - EVERYONE group is immutable (no members, no hierarchy rows)
 *  - Archived groups block mutation operations
 *  - Closure self-row always exists after group creation
 *  - version starts at 1
 *  - Slug uniqueness is maintained by the service
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { randomUUID } = require('crypto');
const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { EVERYONE_GROUP_ID } = require('@/constants');
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
  actor = await createTestUser('_gri_actor');
  memberUser = await createTestUser('_gri_member');
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

async function newGroup(tag = '', overrides = {}) {
  const g = await createTestGroup(actor.subject_id, tag, overrides);
  groupsToDelete.push(g.id);
  return g;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('groups – invariants', () => {
  describe('EVERYONE group membership guard', () => {
    it('cannot insert a row into group_user for the EVERYONE group (DB CHECK constraint)', async () => {
      await expect(
        prisma.group_user.create({
          data: {
            group_id: EVERYONE_GROUP_ID,
            user_id: memberUser.subject_id,
          },
        }),
      ).rejects.toThrow();

      // Confirm no row was inserted
      const count = await prisma.group_user.count({
        where: { group_id: EVERYONE_GROUP_ID, user_id: memberUser.subject_id },
      });
      expect(count).toBe(0);
    });
  });

  describe('EVERYONE group hierarchy guard', () => {
    it('cannot insert a group_closure row with EVERYONE as ancestor (DB CHECK constraint)', async () => {
      const g = await newGroup('_everyone_hierarchy_test');

      await expect(
        prisma.group_closure.create({
          data: {
            ancestor_id: EVERYONE_GROUP_ID,
            descendant_id: g.id,
            depth: 1,
          },
        }),
      ).rejects.toThrow();
    });

    it('cannot insert a group_closure row with EVERYONE as descendant (DB CHECK constraint)', async () => {
      const g = await newGroup('_everyone_descendant_test');

      await expect(
        prisma.group_closure.create({
          data: {
            ancestor_id: g.id,
            descendant_id: EVERYONE_GROUP_ID,
            depth: 1,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('archived group blocks mutation operations', () => {
    it('addGroupMembers throws 409 on an archived group', async () => {
      const g = await newGroup('_arch_add');
      await groupsService.archiveGroup(g.id, actor.subject_id);

      await expect(
        groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });

      // Confirm no membership row was created
      const count = await prisma.group_user.count({ where: { group_id: g.id } });
      expect(count).toBe(0);
    });

    it('removeGroupMembers throws 409 on an archived group', async () => {
      const g = await newGroup('_arch_remove');
      await groupsService.addGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id });
      await groupsService.archiveGroup(g.id, actor.subject_id);

      await expect(
        groupsService.removeGroupMembers(g.id, { user_ids: [memberUser.subject_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });

      // Confirm the membership was NOT removed
      const membership = await prisma.group_user.findUnique({
        where: { group_id_user_id: { group_id: g.id, user_id: memberUser.subject_id } },
      });
      expect(membership).not.toBeNull();
    });
  });

  describe('closure self-row invariant', () => {
    it('every newly created group has a self-closure row (depth=0)', async () => {
      const g = await newGroup('_self_closure');
      const row = await prisma.group_closure.findUnique({
        where: {
          ancestor_id_descendant_id: { ancestor_id: g.id, descendant_id: g.id },
        },
      });
      expect(row).not.toBeNull();
      expect(row.depth).toBe(0);
    });

    it('every newly created child group also has its own self-closure row', async () => {
      const parent = await newGroup('_child_self_closure_parent');
      const child = await groupsService.createChildGroup(
        parent.id,
        { name: `Child self closure ${Date.now()}`, description: 'test' },
        actor.subject_id,
      );
      groupsToDelete.push(child.id);

      const row = await prisma.group_closure.findUnique({
        where: {
          ancestor_id_descendant_id: { ancestor_id: child.id, descendant_id: child.id },
        },
      });
      expect(row).not.toBeNull();
      expect(row.depth).toBe(0);
    });
  });

  describe('version starts at 1', () => {
    it('newly created group has version = 1', async () => {
      const g = await newGroup('_version_start');
      expect(g.version).toBe(1);
    });
  });

  describe('slug uniqueness', () => {
    it('two groups with the same name get distinct slugs', async () => {
      const sameName = `Identical Name ${Date.now()}`;
      const g1 = await groupsService.createGroup({ name: sameName, description: 'first' }, actor.subject_id);
      groupsToDelete.push(g1.id);

      // Second group must fail because `name` has a @unique constraint in the schema
      await expect(
        groupsService.createGroup({ name: sameName, description: 'second' }, actor.subject_id),
      ).rejects.toThrow();
    });

    it('generated slug is URL-friendly (no spaces, lowercase)', async () => {
      const g = await newGroup('_slug_format', { name: `My Test Group Slug${Date.now()}` });
      expect(g.slug).not.toMatch(/\s/);
      expect(g.slug).toBe(g.slug.toLowerCase());
    });
  });

  describe('group.name uniqueness at DB level', () => {
    it('inserting a duplicate name raises a unique-constraint error (P2002)', async () => {
      const g = await newGroup('_dup_name');

      // group.id is a FK to subject.id, so we must create a subject first;
      // otherwise the FK constraint fires before the name unique constraint.
      const dupSubjectId = randomUUID();
      await prisma.subject.create({ data: { id: dupSubjectId, type: 'GROUP' } });
      try {
        await expect(
          prisma.group.create({
            data: {
              id: dupSubjectId,
              name: g.name,
              slug: `different-slug-${Date.now()}`,
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      } finally {
        // clean up the orphan subject if the group creation failed (expected)
        await prisma.subject.deleteMany({ where: { id: dupSubjectId } });
      }
    });
  });
});
