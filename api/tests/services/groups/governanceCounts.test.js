/**
 * governanceCounts.test.js
 *
 * `/v2/users/me` reports how many groups a user administers and how many they oversee, from the
 * membership views. An admin of a parent group oversees its child, a plain member of the parent
 * oversees nothing, and a user in no group has both counts at zero.
 *
 * @see docs/design/groups/access-model-verification-plan.md — The persona goes
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupService = require('@/services/groups');
const {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let admin;
let member;
let outsider;
let parent;
let child;

beforeAll(async () => {
  admin = await createTestUser('_gc_admin');
  member = await createTestUser('_gc_member');
  outsider = await createTestUser('_gc_outsider');
  parent = await createTestGroup(admin.subject_id, '_gc_parent');
  child = await createTestChildGroup(parent.id, admin.subject_id, '_gc_child');
  await prisma.group_user.createMany({
    data: [
      { group_id: parent.id, user_id: admin.subject_id, role: 'ADMIN' },
      { group_id: parent.id, user_id: member.subject_id, role: 'MEMBER' },
    ],
  });
}, 30_000);

afterAll(async () => {
  await deleteGroup(child.id).catch(() => {});
  await deleteGroup(parent.id).catch(() => {});
  await deleteUser(outsider.id);
  await deleteUser(member.id);
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

test('an admin of a parent group administers one group and oversees its child', async () => {
  expect(await groupService.governanceCounts(admin.subject_id))
    .toEqual({ admin_group_count: 1, oversight_group_count: 1 });
});

test('a member administers and oversees nothing', async () => {
  expect(await groupService.governanceCounts(member.subject_id))
    .toEqual({ admin_group_count: 0, oversight_group_count: 0 });
});

test('a user in no group has both counts at zero', async () => {
  expect(await groupService.governanceCounts(outsider.subject_id))
    .toEqual({ admin_group_count: 0, oversight_group_count: 0 });
});
