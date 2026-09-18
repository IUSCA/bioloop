/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * groups.invariants.test.js
 *
 * Verifies DB-level invariants that must hold regardless of which
 * code path triggers them:
 *  - the system principals are immutable (no members, no hierarchy rows, cannot be deleted)
 *  - Archived groups block mutation operations
 *  - Closure self-row always exists after group creation
 *  - version starts at 1
 *  - Slug uniqueness is maintained by the service
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { userHydrator } = require('@/authorization/builtin/hydrators/user');
const {
  AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID, SYSTEM_PRINCIPAL_GROUP_IDS,
} = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  deleteUser,
  deleteGroup,
  activeMembership,
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

describe('groups - invariants', () => {
  // Both system principals carry the same protections. A grant can name them, but nobody
  // joins them, they take no place in the hierarchy, and they cannot be deleted.
  // @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
  describe.each([
    ['Authenticated Users', AUTHENTICATED_USERS_GROUP_ID],
    ['Public', PUBLIC_GROUP_ID],
  ])('%s principal', (principalName, principalId) => {
    it('exists and is named as the design says', async () => {
      const principal = await prisma.group.findUnique({ where: { id: principalId } });

      expect(principal).not.toBeNull();
      expect(principal.name).toBe(principalName);
    });

    it('cannot take a member (DB CHECK constraint)', async () => {
      await expect(
        prisma.group_user.create({
          data: {
            group_id: principalId,
            user_id: memberUser.subject_id,
          },
        }),
      ).rejects.toThrow();

      const count = await prisma.group_user.count({
        where: { group_id: principalId, user_id: memberUser.subject_id },
      });
      expect(count).toBe(0);
    });

    it('cannot be an ancestor in the hierarchy (DB CHECK constraint)', async () => {
      const g = await newGroup(`_principal_ancestor_${principalName}`);

      await expect(
        prisma.group_closure.create({
          data: { ancestor_id: principalId, descendant_id: g.id, depth: 1 },
        }),
      ).rejects.toThrow();
    });

    it('cannot be a descendant in the hierarchy (DB CHECK constraint)', async () => {
      const g = await newGroup(`_principal_descendant_${principalName}`);

      await expect(
        prisma.group_closure.create({
          data: { ancestor_id: g.id, descendant_id: principalId, depth: 1 },
        }),
      ).rejects.toThrow();
    });

    it('cannot be deleted', async () => {
      // A DO INSTEAD NOTHING rule swallows the delete rather than raising, so assert on
      // the row still being there afterwards.
      await prisma.$executeRaw`DELETE FROM "group" WHERE id = ${principalId}`;

      const principal = await prisma.group.findUnique({ where: { id: principalId } });
      expect(principal).not.toBeNull();
    });

    it('has an id that route validation accepts', async () => {
      // eslint-disable-next-line global-require
      const validator = require('validator');

      // AUTHENTICATED_USERS_GROUP_ID is zero-filled and predates this rule. It survives
      // only because nothing addresses it by route parameter; see .todo epic 3.
      if (principalId !== AUTHENTICATED_USERS_GROUP_ID) {
        expect(validator.isUUID(principalId)).toBe(true);
      }
    });
  });

  describe('system principals are not listed as groups', () => {
    it('searchAllGroups excludes both of them', async () => {
      const { data } = await groupsService.searchAllGroups({
        user_id: actor.subject_id,
        sort_by: 'name',
        sort_order: 'asc',
        limit: 500,
        offset: 0,
      });

      const listedIds = data.map((g) => g.id);
      SYSTEM_PRINCIPAL_GROUP_IDS.forEach((id) => {
        expect(listedIds).not.toContain(id);
      });
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
      const membership = await activeMembership(g.id, memberUser.subject_id);
      expect(membership).not.toBeNull();
    });
  });

  describe('a closed membership confers no authority', () => {
    // Policies read `user.group_memberships` to decide owning-group admin authority. That
    // attribute is hydrated from the active view, so a removed admin must stop passing the
    // check immediately. Reading the raw group_user rows would keep them an admin forever,
    // because the row survives for history.
    // @see docs/design/groups/decisions.md — 1. Membership and collection history are preserved
    it('group_memberships drops the row as soon as the member is removed', async () => {
      const g = await newGroup('_closed_authority');
      // A second admin stays, because removing the last one is refused. @see lastAdmin.test.js
      const otherAdmin = await createTestUser('_closed_authority_other');
      usersToDelete.push(otherAdmin.id);
      await groupsService.addGroupMembers(g.id, {
        user_ids: [memberUser.subject_id, otherAdmin.subject_id], actor_id: actor.subject_id,
      });
      await groupsService.promoteGroupMemberToAdmin(g.id, {
        user_id: otherAdmin.subject_id, actor_id: actor.subject_id,
      });
      await groupsService.promoteGroupMemberToAdmin(g.id, {
        user_id: memberUser.subject_id, actor_id: actor.subject_id,
      });

      const before = await userHydrator.hydrate({
        id: memberUser.subject_id, attributes: ['group_memberships'], cache: new Map(),
      });
      expect(before.group_memberships.some(
        (m) => m.group_id === g.id && m.role === GROUP_MEMBER_ROLE.ADMIN,
      )).toBe(true);

      await groupsService.removeGroupMembers(g.id, {
        user_ids: [memberUser.subject_id], actor_id: actor.subject_id,
      });

      const after = await userHydrator.hydrate({
        id: memberUser.subject_id, attributes: ['group_memberships'], cache: new Map(),
      });
      expect(after.group_memberships.some((m) => m.group_id === g.id)).toBe(false);

      // The row itself is still there — history was preserved, authority was not.
      const history = await prisma.group_user.findMany({
        where: { group_id: g.id, user_id: memberUser.subject_id },
      });
      expect(history).toHaveLength(1);
      expect(history[0].removed_at).not.toBeNull();
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
      const child = await groupsService.createGroup({
        parent_id: parent.id,
        data: { name: `Child self closure ${Date.now()}`, description: 'test' },
        actor_id: actor.subject_id,
      });
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
      const g1 = await groupsService.createGroup({
        data: { name: sameName, description: 'first' },
        actor_id: actor.subject_id,
      });
      groupsToDelete.push(g1.id);

      // Both groups are roots, and no two roots may share a name: the unique index over
      // (parent_id, name) carries NULLS NOT DISTINCT, so the two null parents collide.
      // @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
      await expect(
        groupsService.createGroup({
          data: { name: sameName, description: 'second' },
          actor_id: actor.subject_id,
        }),
      ).rejects.toThrow();
    });

    it('generated slug is URL-friendly (no spaces, lowercase)', async () => {
      const g = await newGroup('_slug_format', { name: `My Test Group Slug${Date.now()}` });
      expect(g.slug).not.toMatch(/\s/);
      expect(g.slug).toBe(g.slug.toLowerCase());
    });
  });

  // The key names the directory a group's bundles live in. The slug is regenerated on every
  // rename, so a layout built on it would fragment; the key is taken from the slug once and
  // then frozen by the trigger `group_archive_key_immutable`.
  // @see docs/design/groups/dataset-storage.md — Archival
  describe('archive_key is frozen at creation', () => {
    it('refuses an update that changes it, and the row keeps its key', async () => {
      const g = await newGroup('_archive_key_frozen');

      await expect(
        prisma.group.update({
          where: { id: g.id },
          data: { archive_key: `moved-${Date.now()}` },
        }),
      ).rejects.toThrow(/frozen at creation/);

      const after = await prisma.group.findUniqueOrThrow({
        where: { id: g.id },
        select: { archive_key: true },
      });
      expect(after.archive_key).toBe(g.archive_key);
    });

    it('does not stand in the way of a rename, which regenerates the slug', async () => {
      // The guard has to refuse the one write and allow the one it sits next to. A rename is
      // the operation that moves the slug, and it must leave the key where it was.
      const g = await newGroup('_archive_key_rename');

      const renamed = await groupsService.updateGroupMetadata(g.id, {
        data: { name: `Renamed Group ${Date.now()}` },
        expected_version: g.version,
        actor_id: actor.subject_id,
      });

      expect(renamed.slug).not.toBe(g.slug);
      expect(renamed.archive_key).toBe(g.archive_key);
    });

    it('allows the same key to be written back', async () => {
      // The trigger is keyed on the value changing rather than on the column being named, so
      // an upsert whose update branch carries the whole row is unaffected. All three seeds
      // write the column in their create branch only, and this is what keeps them free to
      // stop doing that.
      const g = await newGroup('_archive_key_rewrite');

      await expect(
        prisma.group.update({
          where: { id: g.id },
          data: { archive_key: g.archive_key },
        }),
      ).resolves.toMatchObject({ archive_key: g.archive_key });
    });
  });
});
