/**
 * dataset.eligible-owner-groups.test.js
 *
 * `GET /v2/datasets/eligible-owner-groups` answers which groups a caller may give a new dataset
 * to, and says which rule admitted each one. The route decides `dataset.contribute` on every
 * candidate the path statement names, so the list agrees with the creation routes by
 * construction: a group offered here is one they admit, and one they admit is offered here.
 *
 * @see docs/design/groups/dataset-creation.md — Choosing the group
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const { initializePolicyContext, authorizeAction } = require('@/authorization');
const { getOwnerGroupForAuthorization } = require('@/services/datasets_v2');
const groupsService = require('@/services/groups');
const datasetRoutes = require('@/routes/datasets_v2');
const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use(initializePolicyContext);
app.use('/v2/datasets', datasetRoutes);
app.use(errorHandler);

let admin;
let member;
let loner;
let platformAdmin;
let adminOf;
let openGroup;
let closedGroup;
let archivedOpenGroup;

const usersToDelete = [];
const groupsToDelete = [];

const eligibleFor = async (user) => {
  currentUser = user;
  const res = await request(app).get('/v2/datasets/eligible-owner-groups');
  expect(res.status).toBe(200);
  return new Map(res.body.map((g) => [g.id, g]));
};

beforeAll(async () => {
  admin = await createTestUser('_eog_admin');
  member = await createTestUser('_eog_member');
  loner = await createTestUser('_eog_loner');
  platformAdmin = await createTestUser('_eog_platform');
  usersToDelete.push(admin.id, member.id, loner.id, platformAdmin.id);
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: role.id } });

  adminOf = await createTestGroup(admin.subject_id, '_eog_admin_of');
  openGroup = await createTestGroup(admin.subject_id, '_eog_open');
  closedGroup = await createTestGroup(admin.subject_id, '_eog_closed');
  archivedOpenGroup = await createTestGroup(admin.subject_id, '_eog_archived');
  groupsToDelete.push(adminOf.id, openGroup.id, closedGroup.id, archivedOpenGroup.id);

  for (const id of [openGroup.id, archivedOpenGroup.id]) {
    await prisma.group.update({ where: { id }, data: { allow_user_contributions: true } });
  }

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
  // Archived through the service, so the restriction the engine reads is written.
  await groupsService.archiveGroup(archivedOpenGroup.id, admin.subject_id);
}, 30_000);

afterAll(async () => {
  await groupsService.unarchiveGroup(archivedOpenGroup.id, admin.subject_id).catch(() => {});
  await prisma.group_user.deleteMany({ where: { group_id: { in: groupsToDelete } } });
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('GET /v2/datasets/eligible-owner-groups', () => {
  test('offers a group admin the group they administer, marked ADMIN', async () => {
    const groups = await eligibleFor(admin);

    expect(groups.get(adminOf.id)?.admitted_by).toBe('ADMIN');
  });

  test('offers a member only the groups that accept contributions', async () => {
    const groups = await eligibleFor(member);

    expect(groups.get(openGroup.id)?.admitted_by).toBe('CONTRIBUTOR');
    expect(groups.has(closedGroup.id)).toBe(false);
  });

  test('never offers an archived group, however open it is', async () => {
    const groups = await eligibleFor(member);

    expect(groups.has(archivedOpenGroup.id)).toBe(false);
  });

  test('offers a user with no memberships nothing', async () => {
    expect([...(await eligibleFor(loner)).values()]).toEqual([]);
  });

  test('offers a platform admin every active group, marked PLATFORM_ADMIN', async () => {
    const groups = await eligibleFor(platformAdmin);

    expect(groups.get(closedGroup.id)?.admitted_by).toBe('PLATFORM_ADMIN');
    expect(groups.has(archivedOpenGroup.id)).toBe(false);
  });

  test('never offers a system principal, even to a platform admin', async () => {
    // Public and Authenticated Users are groups only so a grant can name them as a subject.
    // Neither has members or a place in the hierarchy, so neither can own data.
    const groups = await eligibleFor(platformAdmin);

    SYSTEM_PRINCIPAL_GROUP_IDS.forEach((id) => {
      expect(groups.has(id)).toBe(false);
    });
  });

  test('refuses a system principal as an owning group for authorization', async () => {
    // The import, upload, and name-check routes resolve the group through this call, so the
    // refusal here is what stops a platform admin from importing a dataset into Public.
    for (const id of SYSTEM_PRINCIPAL_GROUP_IDS) {
      // eslint-disable-next-line no-await-in-loop
      await expect(getOwnerGroupForAuthorization(id)).rejects.toMatchObject({ status: 409 });
    }

    expect(await getOwnerGroupForAuthorization(closedGroup.id)).not.toBeNull();
  });

  test('withholds a group the contribute policy refuses', async () => {
    // Forced unless the member really has a path to the withheld group: a membership in a
    // closed group is a candidate, and only the decision removes it.
    const refused = await authorizeAction('dataset', 'contribute', {
      identifiers: { user: member.subject_id, resource: null },
      preFetched: {
        resource: { owner_group_id: closedGroup.id, owner_group_allows_contributions: false },
      },
    });
    expect(refused.granted).toBe(false);
    expect(await prisma.active_group_user.count({ where: { group_id: closedGroup.id, user_id: member.subject_id } }))
      .toBe(1);
  });
});
