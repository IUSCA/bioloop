/* eslint-disable no-await-in-loop */
/**
 * groups.no-active-admins.test.js
 *
 * Tests for the `getGroupsWithoutActiveAdmins` helper which is used to surface
 * groups that may need admin re-assignment.
 */

const path = require('path');

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
let deletedAdmin;
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_ga_actor');
  deletedAdmin = await createTestUser('_ga_deleted_admin');
  usersToDelete.push(actor.id, deletedAdmin.id);
}, 20_000);

afterAll(async () => {
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) {
    await deleteUser(id).catch(() => {});
  }
  await prisma.$disconnect();
}, 30_000);

async function newGroup(tag = '', overrides = {}) {
  const g = await createTestGroup(actor.subject_id, tag, overrides);
  groupsToDelete.push(g.id);
  return g;
}

describe('groups - getGroupsWithoutActiveAdmins', () => {
  it('returns groups that have no active admins and excludes those with active admins', async () => {
    // Group with an active admin should NOT be returned
    const groupWithActiveAdmin = await groupsService.createGroup({
      data: { name: `Active Admin ${Date.now()}`, description: 'active admin' },
      actor_id: actor.subject_id,
      admins: [actor.subject_id],
    });
    groupsToDelete.push(groupWithActiveAdmin.id);

    // Group with no admins should be returned
    const groupWithoutAdmins = await newGroup('_no_admin');

    // Group with only members (no admin) should be returned
    const groupWithMembersOnly = await groupsService.createGroup({
      data: { name: `Member Only ${Date.now()}`, description: 'member only' },
      actor_id: actor.subject_id,
      members: [actor.subject_id],
    });
    groupsToDelete.push(groupWithMembersOnly.id);

    // Group with an admin who is marked deleted should be returned
    const groupWithDeletedAdmin = await groupsService.createGroup({
      data: { name: `Deleted Admin ${Date.now()}`, description: 'deleted admin' },
      actor_id: actor.subject_id,
      admins: [deletedAdmin.subject_id],
    });
    groupsToDelete.push(groupWithDeletedAdmin.id);

    // Mark the admin user as deleted (should make the group count as having no active admins)
    await prisma.user.update({
      where: { id: deletedAdmin.id },
      data: { is_deleted: true },
    });

    const results = await groupsService.getGroupsWithoutActiveAdmins();
    const ids = results.map((r) => r.id);

    expect(ids).toContain(groupWithoutAdmins.id);
    expect(ids).toContain(groupWithMembersOnly.id);
    expect(ids).toContain(groupWithDeletedAdmin.id);
    expect(ids).not.toContain(groupWithActiveAdmin.id);

    // Ensure returned rows include membership counts
    const recipient = results.find((r) => r.id === groupWithMembersOnly.id);
    expect(recipient._count).toBeDefined();
    expect(recipient._count.members).toBeGreaterThanOrEqual(0);
  });

  it('does not include archived groups even if they lack active admins', async () => {
    const archivedGroup = await newGroup('_archived_no_admin');
    await groupsService.archiveGroup(archivedGroup.id, actor.subject_id);

    const results = await groupsService.getGroupsWithoutActiveAdmins();
    const ids = results.map((r) => r.id);

    expect(ids).not.toContain(archivedGroup.id);
  });
});
