/**
 * dataset.eligible-owner-groups.test.js
 *
 * listEligibleOwnerGroups answers which groups a caller may give a new dataset to, and says
 * which rule admitted each one. The list must agree with the dataset.contribute policy: a
 * group offered here is one the engine admits, and one it admits is offered here.
 *
 * @see docs/design/groups/dataset-creation-plan.md — A2
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { listEligibleOwnerGroups } = require('@/services/datasets_v2');
const { authorizeAction } = require('@/authorization');
const {
  createTestUser,
  createTestGroup,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let admin;
let member;
let loner;
let adminOf;
let openGroup;
let closedGroup;
let archivedOpenGroup;

const usersToDelete = [];
const groupsToDelete = [];

const byId = (groups) => new Map(groups.map((g) => [g.id, g]));

beforeAll(async () => {
  admin = await createTestUser('_eog_admin');
  member = await createTestUser('_eog_member');
  loner = await createTestUser('_eog_loner');
  usersToDelete.push(admin.id, member.id, loner.id);

  adminOf = await createTestGroup(admin.subject_id, '_eog_admin_of');
  openGroup = await createTestGroup(admin.subject_id, '_eog_open');
  closedGroup = await createTestGroup(admin.subject_id, '_eog_closed');
  archivedOpenGroup = await createTestGroup(admin.subject_id, '_eog_archived');
  groupsToDelete.push(adminOf.id, openGroup.id, closedGroup.id, archivedOpenGroup.id);

  for (const id of [openGroup.id, archivedOpenGroup.id]) {
    await prisma.group.update({ where: { id }, data: { allow_user_contributions: true } });
  }
  await prisma.group.update({
    where: { id: archivedOpenGroup.id },
    data: { is_archived: true, archived_at: new Date() },
  });

  await prisma.group_user.createMany({
    data: [
      {
        group_id: adminOf.id, user_id: admin.subject_id, role: 'ADMIN', assigned_by: admin.subject_id,
      },
      {
        group_id: openGroup.id, user_id: member.subject_id, role: 'MEMBER', assigned_by: admin.subject_id,
      },
      {
        group_id: closedGroup.id, user_id: member.subject_id, role: 'MEMBER', assigned_by: admin.subject_id,
      },
      {
        group_id: archivedOpenGroup.id, user_id: member.subject_id, role: 'MEMBER', assigned_by: admin.subject_id,
      },
    ],
  });
}, 30_000);

afterAll(async () => {
  await prisma.group_user.deleteMany({ where: { group_id: { in: groupsToDelete } } });
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('listEligibleOwnerGroups', () => {
  test('offers a group admin the group they administer, marked ADMIN', async () => {
    const groups = byId(await listEligibleOwnerGroups({ subject_id: admin.subject_id, roles: ['user'] }));

    expect(groups.get(adminOf.id)?.admitted_by).toBe('ADMIN');
  });

  test('offers a member only the groups that accept contributions', async () => {
    const groups = byId(await listEligibleOwnerGroups({ subject_id: member.subject_id, roles: ['user'] }));

    expect(groups.get(openGroup.id)?.admitted_by).toBe('CONTRIBUTOR');
    expect(groups.has(closedGroup.id)).toBe(false);
  });

  test('never offers an archived group, however open it is', async () => {
    const groups = byId(await listEligibleOwnerGroups({ subject_id: member.subject_id, roles: ['user'] }));

    expect(groups.has(archivedOpenGroup.id)).toBe(false);
  });

  test('offers a user with no memberships nothing', async () => {
    const groups = await listEligibleOwnerGroups({ subject_id: loner.subject_id, roles: ['user'] });

    expect(groups).toEqual([]);
  });

  test('offers a platform admin every active group, marked PLATFORM_ADMIN', async () => {
    const groups = byId(await listEligibleOwnerGroups({ subject_id: loner.subject_id, roles: ['admin'] }));

    expect(groups.get(closedGroup.id)?.admitted_by).toBe('PLATFORM_ADMIN');
    expect(groups.has(archivedOpenGroup.id)).toBe(false);
  });

  test('agrees with the contribute policy on every group it offers', async () => {
    // The list is a convenience; the engine is the control. They must not disagree, or a
    // user is shown a group whose create then fails.
    const offered = await listEligibleOwnerGroups({ subject_id: member.subject_id, roles: ['user'] });

    for (const group of offered) {
      const decision = await authorizeAction('dataset', 'contribute', {
        identifiers: { user: member.subject_id, resource: null },
        preFetched: {
          resource: {
            owner_group_id: group.id,
            owner_group_allows_contributions: group.allow_user_contributions,
          },
        },
      });
      expect(decision.granted).toBe(true);
    }

    // And the one it withholds is genuinely withheld.
    const refused = await authorizeAction('dataset', 'contribute', {
      identifiers: { user: member.subject_id, resource: null },
      preFetched: {
        resource: { owner_group_id: closedGroup.id, owner_group_allows_contributions: false },
      },
    });
    expect(refused.granted).toBe(false);
  });
});
