/**
 * auth.invite.test.js
 *
 * Spending an invitation token: `/check` before signing in, `/apply` after.
 *
 * The invited address lives in the row and not in the token, so the server decides who a link
 * belongs to. A forwarded link fails at `/apply` no matter what the client claims, and the
 * token itself decodes to nothing a recipient could read.
 *
 * @see .todo/issues/01-group-invitations.md — Phase 5
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');
const { INVITATION_STATUS, GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const invitationService = require('@/services/invitations');
const groupsService = require('@/services/groups');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup, activeMembership,
} = require('../services/helpers');

// `authenticate` reads a JWT the tests have no way to mint, so it is replaced by a switch the
// tests set. What is under test is what the handlers do with req.user, not the JWT. The name
// has to begin with `mock`: jest refuses a module factory that closes over anything else.
let mockCurrentUser = null;

jest.mock('@/middleware/auth', () => {
  // eslint-disable-next-line global-require
  const httpErrors = require('http-errors');
  return {
    ...jest.requireActual('@/middleware/auth'),
    authenticate: (req, res, next) => {
      if (!mockCurrentUser) return next(httpErrors.Unauthorized());
      req.user = mockCurrentUser;
      return next();
    },
  };
});

// Required after the mock so the router picks it up.
// eslint-disable-next-line import/order
const inviteRoutes = require('@/routes/auth/invite');

const app = express();
app.use(express.json());
app.use('/auth/invite', inviteRoutes);
app.use(errorHandler);

let admin;
let dana;
let someoneElse;
let group;

const usersToDelete = [];
const groupsToDelete = [];

async function clearInvitations() {
  await prisma.group_invitation.deleteMany({
    where: { OR: [{ group_id: { in: groupsToDelete } }, { invited_by: admin?.subject_id }] },
  });
}

/** Issue an invitation and hand back its token. */
async function inviteToken(email, overrides = {}) {
  const { invitation } = await invitationService.createInvitation({
    group_id: group.id, email, invited_by: admin.subject_id, ...overrides,
  });
  return invitation;
}

beforeAll(async () => {
  admin = await createTestUser('_tok_admin');
  dana = await createTestUser('_tok_dana');
  someoneElse = await createTestUser('_tok_other');
  usersToDelete.push(admin.id, dana.id, someoneElse.id);
  group = await createTestGroup(admin.subject_id, '_tok_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterEach(async () => {
  mockCurrentUser = null;
  await prisma.group_user.deleteMany({
    where: { user_id: { in: [dana.subject_id, someoneElse.subject_id] } },
  });
  await clearInvitations();
});

afterAll(async () => {
  await clearInvitations();
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

const check = (token) => request(app).post('/auth/invite/check').send({ token });
const apply = (token) => request(app).post('/auth/invite/apply').send({ token });

describe('checking a link', () => {
  test('a live invitation is valid and names the address it went to', async () => {
    const inv = await inviteToken('dana@university.edu');
    const res = await check(inv.token);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'valid', email: 'dana@university.edu' });
  });

  test('needs no authentication, because the recipient has not signed in yet', async () => {
    const inv = await inviteToken('dana@university.edu');
    mockCurrentUser = null;
    expect((await check(inv.token)).status).toBe(200);
  });

  test('checking does not spend it', async () => {
    const inv = await inviteToken('dana@university.edu');
    await check(inv.token);
    await check(inv.token);

    const after = await prisma.group_invitation.findUnique({ where: { id: inv.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });

  test.each([
    ['an unknown token', async () => 'x'.repeat(43)],
    ['an expired one', async () => {
      const inv = await inviteToken('dana@university.edu');
      await prisma.group_invitation.update({
        where: { id: inv.id }, data: { expires_at: new Date(Date.now() - 1000) },
      });
      return inv.token;
    }],
    ['a cancelled one', async () => {
      const inv = await inviteToken('dana@university.edu');
      await invitationService.cancelInvitation({ group_id: group.id, invitation_id: inv.id });
      return inv.token;
    }],
    ['one whose group has been archived', async () => {
      const archived = await createTestGroup(admin.subject_id, '_tok_arch');
      groupsToDelete.push(archived.id);
      const inv = await inviteToken('dana@university.edu', { group_id: archived.id });
      await groupsService.archiveGroup(archived.id, admin.subject_id);
      return inv.token;
    }],
  ])('%s answers invalid, and says nothing else', async (_label, makeToken) => {
    // One shape for every failure. A reason would tell an unauthenticated caller the state of
    // somebody else's invitation; it goes to the log instead.
    const res = await check(await makeToken());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'invalid' });
  });

  test('an empty token is rejected before any lookup', async () => {
    expect((await check('')).status).toBe(400);
  });
});

describe('spending a link', () => {
  test('puts the authenticated user in the group with the invited role', async () => {
    const inv = await inviteToken(dana.email, { role: GROUP_MEMBER_ROLE.ADMIN });
    mockCurrentUser = dana;

    const res = await apply(inv.token);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ group_name: group.name, role: GROUP_MEMBER_ROLE.ADMIN });
    const membership = await activeMembership(group.id, dana.subject_id);
    expect(membership.role).toBe(GROUP_MEMBER_ROLE.ADMIN);
  });

  test('needs authentication', async () => {
    const inv = await inviteToken(dana.email);
    mockCurrentUser = null;
    expect((await apply(inv.token)).status).toBe(401);
  });

  test('a forwarded link fails for whoever else signs in', async () => {
    // The invited address is in the row. Nothing the client sends is trusted, and the person
    // holding the link learns nothing about who it was for.
    const inv = await inviteToken(dana.email);
    mockCurrentUser = someoneElse;

    const res = await apply(inv.token);

    expect(res.status).toBe(403);
    expect(res.body.message).not.toContain(dana.email);
    expect(await activeMembership(group.id, someoneElse.subject_id)).toBeNull();
    const after = await prisma.group_invitation.findUnique({ where: { id: inv.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });

  test('matches on the normalised address, not the string that was typed', async () => {
    const inv = await inviteToken(dana.email.toUpperCase());
    mockCurrentUser = dana;
    expect((await apply(inv.token)).status).toBe(200);
  });

  test('spending it twice is refused the second time', async () => {
    const inv = await inviteToken(dana.email);
    mockCurrentUser = dana;

    expect((await apply(inv.token)).status).toBe(200);
    expect((await apply(inv.token)).status).toBe(404);

    // And one membership, not two.
    const rows = await prisma.group_user.findMany({
      where: { group_id: group.id, user_id: dana.subject_id, removed_at: null },
    });
    expect(rows).toHaveLength(1);
  });

  test('two tabs racing on the same token produce one membership', async () => {
    // SELECT FOR UPDATE serialises them. One wins and the other is told the link is spent;
    // neither leaves a duplicate membership behind.
    const inv = await inviteToken(dana.email);
    mockCurrentUser = dana;

    const results = await Promise.all([apply(inv.token), apply(inv.token), apply(inv.token)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 404)).toHaveLength(2);

    const rows = await prisma.group_user.findMany({
      where: { group_id: group.id, user_id: dana.subject_id, removed_at: null },
    });
    expect(rows).toHaveLength(1);
  });

  test('an expired link is refused', async () => {
    const inv = await inviteToken(dana.email);
    await prisma.group_invitation.update({
      where: { id: inv.id }, data: { expires_at: new Date(Date.now() - 1000) },
    });
    mockCurrentUser = dana;
    expect((await apply(inv.token)).status).toBe(404);
  });

  test('a group archived since the link was sent is a 409, and the link is closed', async () => {
    const archived = await createTestGroup(admin.subject_id, '_tok_gone');
    groupsToDelete.push(archived.id);
    const inv = await inviteToken(dana.email, { group_id: archived.id });
    await groupsService.archiveGroup(archived.id, admin.subject_id);
    mockCurrentUser = dana;

    const res = await apply(inv.token);

    expect(res.status).toBe(409);
    // Closed with a reason rather than left pending, so it stops appearing as outstanding.
    const after = await prisma.group_invitation.findUnique({ where: { id: inv.id } });
    expect(after.status).toBe(INVITATION_STATUS.CANCELLED);
    expect(after.cancellation_reason).toBe('group_archived');
  });

  test('someone already in the group closes the invitation without a second membership', async () => {
    // Invited first, then added by hand. createInvitation refuses an existing member, so the
    // only way to reach this state is for the membership to arrive after the invitation —
    // which is exactly the race the idempotency is for.
    const inv = await inviteToken(dana.email, { role: GROUP_MEMBER_ROLE.ADMIN });
    await prisma.group_user.create({
      data: { group_id: group.id, user_id: dana.subject_id, role: GROUP_MEMBER_ROLE.MEMBER },
    });
    mockCurrentUser = dana;

    expect((await apply(inv.token)).status).toBe(200);

    const rows = await prisma.group_user.findMany({
      where: { group_id: group.id, user_id: dana.subject_id, removed_at: null },
    });
    expect(rows).toHaveLength(1);
    // The existing membership is not upgraded. An invitation is not a way to change a role.
    expect(rows[0].role).toBe(GROUP_MEMBER_ROLE.MEMBER);
    const after = await prisma.group_invitation.findUnique({ where: { id: inv.id } });
    expect(after.status).toBe(INVITATION_STATUS.ACCEPTED);
  });
});
