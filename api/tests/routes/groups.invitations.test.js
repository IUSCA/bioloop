/**
 * groups.invitations.test.js
 *
 * The three invitation routes on a group, and who may reach them.
 *
 * Two properties matter more than the happy path. The response says nothing about whether
 * the invited address has an account, because a group admin who could tell would be able to
 * enumerate the portal's users one address at a time. And cancelling matches on the group as
 * well as the invitation id, so holding another group's id is not enough.
 *
 * @see .todo/issues/01-group-invitations.md — Phase 2
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');
const { randomUUID } = require('crypto');
const { INVITATION_STATUS, GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const groupRoutes = require('@/routes/groups');
const groupsService = require('@/services/groups');
const {
  createTestUser, createTestGroup, deleteGroup, deleteUser, activeMembership,
} = require('../services/helpers');

// The routes read `req.user` and nothing else off the request, so authentication is a switch
// the tests set. Mounting the whole app would start the TUS server for no gain.
let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use('/groups', groupRoutes);
app.use(errorHandler);

let admin;
let outsider;
let member;
let group;
let otherGroup;

const usersToDelete = [];
const groupsToDelete = [];

async function clearInvitations() {
  await prisma.group_invitation.deleteMany({
    where: { OR: [{ group_id: { in: groupsToDelete } }, { invited_by: admin?.subject_id }] },
  });
}

beforeAll(async () => {
  admin = await createTestUser('_invite_admin');
  outsider = await createTestUser('_invite_out');
  member = await createTestUser('_invite_mem');
  usersToDelete.push(admin.id, outsider.id, member.id);

  group = await createTestGroup(admin.subject_id, '_invite_group');
  otherGroup = await createTestGroup(admin.subject_id, '_invite_other');
  groupsToDelete.push(group.id, otherGroup.id);

  // Creating a group does not make the creator an admin of it, so say so explicitly.
  for (const g of [group, otherGroup]) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.group_user.create({
      data: { group_id: g.id, user_id: admin.subject_id, role: GROUP_MEMBER_ROLE.ADMIN },
    });
  }
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: member.subject_id, role: GROUP_MEMBER_ROLE.MEMBER },
  });
}, 30_000);

afterEach(async () => {
  currentUser = null;
  await clearInvitations();
});

afterAll(async () => {
  await clearInvitations();
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

/** Issue an invitation as whoever `currentUser` is. */
const post = (body, id = group.id) => request(app).post(`/groups/${id}/invitations`).send(body);

describe('who may invite', () => {
  test('a group admin may', async () => {
    currentUser = admin;
    const res = await post({ email: 'dana@university.edu' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'invited' });
  });

  test('an ordinary member may not', async () => {
    // Inviting is add_member's authority, and membership never confers it.
    currentUser = member;
    expect((await post({ email: 'dana@university.edu' })).status).toBe(403);
  });

  test('someone outside the group may not', async () => {
    currentUser = outsider;
    expect((await post({ email: 'dana@university.edu' })).status).toBe(403);
  });

  test('reading the list and cancelling need the same admin authority', async () => {
    // Two actions, invite and view_invitations, and both are isGroupAdmin. They are split
    // because ARCHIVED treats them differently, not because a different person holds them.
    currentUser = member;
    expect((await request(app).get(`/groups/${group.id}/invitations`)).status).toBe(403);
    expect((await request(app).delete(`/groups/${group.id}/invitations/${randomUUID()}`)).status)
      .toBe(403);
  });
});

describe('what the response reveals', () => {
  test('an address with an account and one without are indistinguishable', async () => {
    // The whole anti-enumeration property. Two invitations, one to a real account and one to
    // an address nobody has, and the bodies differ only by the invitation id.
    currentUser = admin;
    const withAccount = await post({ email: outsider.email });
    const withoutAccount = await post({ email: 'nobody-at-all@university.edu' });

    expect(withAccount.status).toBe(withoutAccount.status);
    expect(Object.keys(withAccount.body).sort()).toEqual(Object.keys(withoutAccount.body).sort());
    expect(withAccount.body.status).toBe(withoutAccount.body.status);
  });

  test('the token is never in any response', async () => {
    currentUser = admin;
    const created = await post({ email: 'dana@university.edu' });
    const listed = await request(app).get(`/groups/${group.id}/invitations`);

    expect(JSON.stringify(created.body)).not.toMatch(/token/i);
    expect(listed.body.data[0]).not.toHaveProperty('token');
    // And the value itself does not appear under some other key.
    const row = await prisma.group_invitation.findFirst({ where: { group_id: group.id } });
    expect(JSON.stringify(listed.body)).not.toContain(row.token);
  });

  test('inviting the same address twice is 200 rather than 201', async () => {
    currentUser = admin;
    expect((await post({ email: 'dana@university.edu' })).status).toBe(201);

    const second = await post({ email: 'DANA@University.edu' });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('already_invited');
  });
});

describe('validation', () => {
  test.each([
    ['a missing email', {}],
    ['an empty email', { email: '   ' }],
    ['a role that is not a group role', { email: 'dana@university.edu', role: 'PLATFORM_ADMIN' }],
  ])('%s is rejected before anything is written', async (_label, body) => {
    currentUser = admin;
    expect((await post(body)).status).toBe(400);
    expect(await prisma.group_invitation.count({ where: { group_id: group.id } })).toBe(0);
  });

  test('an address that is not an address is a 400, not a stored row', async () => {
    currentUser = admin;
    expect((await post({ email: 'not-an-email' })).status).toBe(400);
    expect(await prisma.group_invitation.count({ where: { group_id: group.id } })).toBe(0);
  });

  test('an archived group takes no invitation, and the restriction is what says so', async () => {
    // The caller is an admin here, so the policy passes and ARCHIVED refuses. That matters
    // beyond the status code: a blocked capability is also absent from the capability map,
    // so the UI never offers the button. The service's own 409 is the second line, reached
    // only if a group is archived between the check and the write.
    const archived = await createTestGroup(admin.subject_id, '_invite_arch');
    groupsToDelete.push(archived.id);
    await prisma.group_user.create({
      data: { group_id: archived.id, user_id: admin.subject_id, role: GROUP_MEMBER_ROLE.ADMIN },
    });
    await groupsService.archiveGroup(archived.id, admin.subject_id);

    currentUser = admin;
    expect((await post({ email: 'dana@university.edu' }, archived.id)).status).toBe(403);
    expect(await prisma.group_invitation.count({ where: { group_id: archived.id } })).toBe(0);
  });

  test('and the outstanding invitations are still readable while it is archived', async () => {
    // The reason view_invitations is its own action. An admin explaining why nobody can join
    // needs the list, and freezing the group is not a reason to hide it.
    const archived = await createTestGroup(admin.subject_id, '_invite_arch2');
    groupsToDelete.push(archived.id);
    await prisma.group_user.create({
      data: { group_id: archived.id, user_id: admin.subject_id, role: GROUP_MEMBER_ROLE.ADMIN },
    });
    currentUser = admin;
    await post({ email: 'dana@university.edu' }, archived.id);
    await groupsService.archiveGroup(archived.id, admin.subject_id);

    const res = await request(app).get(`/groups/${archived.id}/invitations`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('someone already in the group is refused', async () => {
    currentUser = admin;
    expect((await post({ email: member.email })).status).toBe(400);
  });
});

describe('listing', () => {
  test('returns pending invitations by default, with is_expired computed', async () => {
    currentUser = admin;
    await post({ email: 'dana@university.edu' });
    const row = await prisma.group_invitation.findFirst({ where: { group_id: group.id } });
    await prisma.group_invitation.update({
      where: { id: row.id }, data: { expires_at: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/groups/${group.id}/invitations`);
    expect(res.status).toBe(200);
    expect(res.body.metadata.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      invited_email: 'dana@university.edu',
      status: INVITATION_STATUS.PENDING,
      is_expired: true,
    });
    expect(res.body.data[0].inviter).toMatchObject({ username: admin.username });
  });

  test('status=all crosses the statuses', async () => {
    currentUser = admin;
    await post({ email: 'one@university.edu' });
    await post({ email: 'two@university.edu' });
    const row = await prisma.group_invitation.findFirst({
      where: { invited_email: 'one@university.edu' },
    });
    await request(app).delete(`/groups/${group.id}/invitations/${row.id}`);

    const pending = await request(app).get(`/groups/${group.id}/invitations`);
    const all = await request(app).get(`/groups/${group.id}/invitations?status=all`);

    expect(pending.body.metadata.total).toBe(1);
    expect(all.body.metadata.total).toBe(2);
  });

  test('a status outside the enum is rejected', async () => {
    currentUser = admin;
    expect((await request(app).get(`/groups/${group.id}/invitations?status=EXPIRED`)).status)
      .toBe(400);
  });
});

describe('cancelling', () => {
  test('closes the invitation and says why', async () => {
    currentUser = admin;
    await post({ email: 'dana@university.edu' });
    const row = await prisma.group_invitation.findFirst({ where: { group_id: group.id } });

    const res = await request(app).delete(`/groups/${group.id}/invitations/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: INVITATION_STATUS.CANCELLED });

    const after = await prisma.group_invitation.findUnique({ where: { id: row.id } });
    expect(after.cancellation_reason).toBe('admin_cancelled');
  });

  test('an admin of another group cannot cancel through their own group', async () => {
    // The caller is an admin of otherGroup, so authorization passes. The service still
    // refuses, because group_id is part of the match and not only of the check above it.
    currentUser = admin;
    await post({ email: 'dana@university.edu' });
    const row = await prisma.group_invitation.findFirst({ where: { group_id: group.id } });

    const res = await request(app).delete(`/groups/${otherGroup.id}/invitations/${row.id}`);
    expect(res.status).toBe(404);

    const after = await prisma.group_invitation.findUnique({ where: { id: row.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });

  test('an unknown invitation is a 404', async () => {
    currentUser = admin;
    expect((await request(app).delete(`/groups/${group.id}/invitations/${randomUUID()}`)).status)
      .toBe(404);
  });
});

describe('an invitation is not a membership', () => {
  test('issuing one adds nobody to the group', async () => {
    // The row is a standing offer. Nothing about access changes until it is accepted.
    currentUser = admin;
    await post({ email: outsider.email });
    expect(await activeMembership(group.id, outsider.subject_id)).toBeNull();
  });
});
