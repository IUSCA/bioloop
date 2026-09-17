/**
 * dataset.contribute.test.js
 *
 * `contribute` is the action the import and upload routes check. It admits the owning
 * group's admins, and additionally an ordinary member of a group that has
 * allow_user_contributions set. `create` keeps its narrower meaning.
 *
 * @see docs/design/groups/dataset-creation.md — Contribution is a policy, not a comment
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const {
  createTestUser,
  createTestGroup,
  deleteUser,
  deleteGroup,
} = require('../services/helpers');

let admin;
let member;
let outsider;
let openGroup;
let closedGroup;

const usersToDelete = [];
const groupsToDelete = [];

/** Decide `action` for `user` against a group that owns nothing yet. */
async function decide(action, user, group) {
  return authorizeAction('dataset', action, {
    identifiers: { user: user.subject_id, resource: null },
    preFetched: {
      resource: {
        owner_group_id: group.id,
        owner_group_allows_contributions: group.allow_user_contributions,
      },
    },
  });
}

beforeAll(async () => {
  admin = await createTestUser('_contrib_admin');
  member = await createTestUser('_contrib_member');
  outsider = await createTestUser('_contrib_outsider');
  usersToDelete.push(admin.id, member.id, outsider.id);

  // createTestGroup does not make its actor a member, so both roles are added explicitly.
  openGroup = await createTestGroup(admin.subject_id, '_contrib_open');
  closedGroup = await createTestGroup(admin.subject_id, '_contrib_closed');
  groupsToDelete.push(openGroup.id, closedGroup.id);

  openGroup = await prisma.group.update({
    where: { id: openGroup.id },
    data: { allow_user_contributions: true },
  });

  for (const group_id of [openGroup.id, closedGroup.id]) {
    await prisma.group_user.createMany({
      data: [
        {
          group_id, user_id: admin.subject_id, role: 'ADMIN', assigned_by: admin.subject_id,
        },
        {
          group_id, user_id: member.subject_id, role: 'MEMBER', assigned_by: admin.subject_id,
        },
      ],
    });
  }
}, 30_000);

afterAll(async () => {
  await prisma.group_user.deleteMany({
    where: { group_id: { in: [openGroup.id, closedGroup.id] } },
  });
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('contribute admits members of a contributing group', () => {
  test('a group admin may contribute, contributions open or not', async () => {
    expect((await decide('contribute', admin, openGroup)).granted).toBe(true);
    expect((await decide('contribute', admin, closedGroup)).granted).toBe(true);
  });

  test('a member may contribute when the group allows contributions', async () => {
    expect((await decide('contribute', member, openGroup)).granted).toBe(true);
  });

  test('a member may not contribute when the group does not', async () => {
    expect((await decide('contribute', member, closedGroup)).granted).toBe(false);
  });

  test('a non-member may never contribute', async () => {
    expect((await decide('contribute', outsider, openGroup)).granted).toBe(false);
    expect((await decide('contribute', outsider, closedGroup)).granted).toBe(false);
  });
});

describe('create keeps its narrower meaning', () => {
  test('only an admin may create, even where contributions are open', async () => {
    expect((await decide('create', admin, openGroup)).granted).toBe(true);
    expect((await decide('create', member, openGroup)).granted).toBe(false);
    expect((await decide('create', outsider, openGroup)).granted).toBe(false);
  });
});
