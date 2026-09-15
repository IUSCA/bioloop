/**
 * lastAdmin.test.js
 *
 * A group keeps at least one admin. The check used to run in the route, outside the
 * transaction, once per user against the state before any removal. So removing both of two
 * admins in one call passed both checks, and two concurrent removals raced the same way.
 *
 * It now runs inside the removal and demotion transactions, after the group row is locked.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 0: close the live holes
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const {
  createTestUser, createTestGroup, deleteGroup, deleteUser, activeMembership,
} = require('../helpers');

let actor;
let adminA;
let adminB;
let member;
let group;

async function addMembership(user, role) {
  return prisma.group_user.create({ data: { group_id: group.id, user_id: user.subject_id, role } });
}

beforeAll(async () => {
  actor = await createTestUser('_la_actor');
  adminA = await createTestUser('_la_a');
  adminB = await createTestUser('_la_b');
  member = await createTestUser('_la_m');
}, 30_000);

beforeEach(async () => {
  group = await createTestGroup(actor.subject_id, '_la_group');
  await addMembership(adminA, 'ADMIN');
  await addMembership(adminB, 'ADMIN');
  await addMembership(member, 'MEMBER');
});

afterEach(async () => {
  await deleteGroup(group.id).catch(() => {});
});

afterAll(async () => {
  for (const u of [actor, adminA, adminB, member]) {
    // eslint-disable-next-line no-await-in-loop
    await deleteUser(u.id).catch(() => {});
  }
  await prisma.$disconnect();
});

test('removing both admins in one call is refused, and neither is removed', async () => {
  await expect(groupsService.removeGroupMembers(group.id, {
    user_ids: [adminA.subject_id, adminB.subject_id], actor_id: actor.subject_id,
  })).rejects.toMatchObject({ status: 409 });

  expect(await activeMembership(group.id, adminA.subject_id)).not.toBeNull();
  expect(await activeMembership(group.id, adminB.subject_id)).not.toBeNull();
});

test('two concurrent removals of the two admins leave exactly one', async () => {
  const results = await Promise.allSettled([
    groupsService.removeGroupMembers(group.id, { user_ids: [adminA.subject_id], actor_id: actor.subject_id }),
    groupsService.removeGroupMembers(group.id, { user_ids: [adminB.subject_id], actor_id: actor.subject_id }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  const remaining = await prisma.group_user.count({
    where: { group_id: group.id, role: 'ADMIN', removed_at: null },
  });
  expect(remaining).toBe(1);
});

test('demoting the last admin is refused', async () => {
  await groupsService.demoteAdminToMember(group.id, { user_id: adminA.subject_id, actor_id: actor.subject_id });
  await expect(groupsService.demoteAdminToMember(group.id, {
    user_id: adminB.subject_id, actor_id: actor.subject_id,
  })).rejects.toMatchObject({ status: 409 });
});

test('a deleted account does not count as the remaining admin', async () => {
  await prisma.user.update({ where: { id: adminB.id }, data: { is_deleted: true } });
  try {
    await expect(groupsService.removeGroupMembers(group.id, {
      user_ids: [adminA.subject_id], actor_id: actor.subject_id,
    })).rejects.toMatchObject({ status: 409 });
  } finally {
    await prisma.user.update({ where: { id: adminB.id }, data: { is_deleted: false } });
  }
});

test('removing a plain member is never refused', async () => {
  await expect(groupsService.removeGroupMembers(group.id, {
    user_ids: [member.subject_id], actor_id: actor.subject_id,
  })).resolves.toEqual([member.subject_id]);
});
