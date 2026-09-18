/**
 * invitation.service.test.js
 *
 * Issuing, cancelling, and applying group invitations, with no route in front of them.
 *
 * The two facts everything here rests on: an invitation names an email address rather than a
 * user, because the person may have no account; and expiry is the computed condition
 * `PENDING AND expires_at < now()` rather than a status, so nothing has to catch up with it.
 *
 * @see .todo/issues/01-group-invitations.md — Phase 1
 */

const path = require('path');
const { randomUUID } = require('crypto');
const config = require('config');
const { INVITATION_STATUS, GROUP_MEMBER_ROLE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const invitationService = require('@/services/invitations');
const groupsService = require('@/services/groups');
const { normalizeEmail } = require('@/utils/email');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup, activeMembership,
} = require('../helpers');

let admin;
let group;

const usersToDelete = [];
const groupsToDelete = [];

/**
 * Remove every invitation this suite made, so the partial unique index starts clean.
 *
 * Matched on the inviter as well as the group: `invited_by` is ON DELETE RESTRICT, so an
 * invitation left behind blocks deleting the admin who sent it.
 */
async function clearInvitations() {
  await prisma.group_invitation.deleteMany({
    where: { OR: [{ group_id: { in: groupsToDelete } }, { invited_by: admin?.subject_id }] },
  });
}

beforeAll(async () => {
  admin = await createTestUser('_inv_admin');
  usersToDelete.push(admin.id);
  group = await createTestGroup(admin.subject_id, '_inv_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterEach(clearInvitations);

afterAll(async () => {
  await clearInvitations();
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

/** Issue one invitation with the suite's admin and group unless told otherwise. */
const invite = (email, overrides = {}) => invitationService.createInvitation({
  group_id: group.id, email, invited_by: admin.subject_id, ...overrides,
});

describe('the token', () => {
  test('is 43 base64url characters, which is 256 bits', () => {
    const token = invitationService.generateInviteToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('is different every time', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => invitationService.generateInviteToken()),
    );
    expect(tokens.size).toBe(100);
  });

  test('is never returned by the listing an admin reads', async () => {
    // An admin managing invitations has no business holding the value that accepts one.
    await invite('dana@university.edu');
    const { data } = await invitationService.listInvitations({ group_id: group.id });
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty('token');
  });
});

describe('issuing one', () => {
  test('stores the address normalised, not as typed', async () => {
    const { status, invitation } = await invite('  Dana.Smith@University.EDU ');
    expect(status).toBe('invited');
    expect(invitation.invited_email).toBe('dana.smith@university.edu');
  });

  test('refuses a string that is not an address rather than storing it mangled', async () => {
    // validator.normalizeEmail turns 'not-an-email' into '@not-an-email' and would happily
    // store that. The util checks validity first.
    await expect(invite('not-an-email')).rejects.toMatchObject({ status: 400 });
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  test('expires ttl_days from now, and nothing writes an EXPIRED status', async () => {
    const { invitation } = await invite('dana@university.edu');
    const days = config.get('invitations.ttl_days');
    const expected = Date.now() + days * 24 * 60 * 60 * 1000;

    expect(Math.abs(invitation.expires_at.getTime() - expected)).toBeLessThan(60_000);
    expect(invitation.status).toBe(INVITATION_STATUS.PENDING);
    expect(Object.keys(INVITATION_STATUS)).toEqual(['PENDING', 'ACCEPTED', 'CANCELLED']);
  });

  test('asking twice sends one invitation', async () => {
    const first = await invite('dana@university.edu');
    const second = await invite('DANA@university.edu');

    expect(first.status).toBe('invited');
    expect(second.status).toBe('already_invited');
    expect(second.invitation.id).toBe(first.invitation.id);
    expect(await prisma.group_invitation.count({ where: { group_id: group.id } })).toBe(1);
  });

  test('the database, not the service, is what makes two simultaneous invites one', async () => {
    // The read-then-write in createInvitation narrows the race; the partial unique index
    // closes it. Insert straight past the service to prove the index is really there.
    const { invitation } = await invite('dana@university.edu');
    await expect(prisma.group_invitation.create({
      data: {
        token: invitationService.generateInviteToken(),
        group_id: group.id,
        invited_email: invitation.invited_email,
        invited_by: admin.subject_id,
        expires_at: new Date(Date.now() + 86_400_000),
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  test('a cancelled invitation does not block a new one', async () => {
    // Only PENDING rows are unique. The closed ones are the record of who was asked.
    const { invitation } = await invite('dana@university.edu');
    await invitationService.cancelInvitation({
      group_id: group.id, invitation_id: invitation.id,
    });

    const again = await invite('dana@university.edu');
    expect(again.status).toBe('invited');
    expect(again.invitation.id).not.toBe(invitation.id);
    expect(await prisma.group_invitation.count({ where: { group_id: group.id } })).toBe(2);
  });

  describe('an expired invitation does not block a new one', () => {
    // The partial unique index counts every PENDING row, and an expired row is still PENDING.
    // The service's own check skips expired rows, so the insert hits the index, and the P2002
    // branch answers already_invited with the dead row. No mail goes out, because only a
    // fresh invitation is announced, and the admin reads success.

    /** Issue an invitation to dana and move its expiry into the past. */
    async function expiredInvitation() {
      const { invitation } = await invite('dana@university.edu');
      await prisma.group_invitation.update({
        where: { id: invitation.id },
        data: { expires_at: new Date(Date.now() - 1000) },
      });
      return invitation;
    }

    test('inviting again issues a fresh invitation', async () => {
      const expired = await expiredInvitation();

      const again = await invite('dana@university.edu');

      // 'invited' is also the only status that sends the email.
      expect(again.status).toBe('invited');
      expect(again.invitation.id).not.toBe(expired.id);
      expect(again.invitation.token).not.toBe(expired.token);
      expect(again.invitation.expires_at.getTime()).toBeGreaterThan(Date.now());
    });

    test('the fresh invitation is one the person can actually accept', async () => {
      const dana = await createTestUser('_inv_reinvite');
      usersToDelete.push(dana.id);
      const { invitation } = await invite(dana.email);
      await prisma.group_invitation.update({
        where: { id: invitation.id },
        data: { expires_at: new Date(Date.now() - 1000) },
      });

      await invite(dana.email).catch(() => {});
      const { applied } = await prisma.$transaction((tx) => invitationService
        .applyPendingInvitations({ email: dana.email, user_subject_id: dana.subject_id, tx }));

      expect(applied).toHaveLength(1);
      expect(await activeMembership(group.id, dana.subject_id)).not.toBeNull();
    });

    test('the lapsed one is closed with a reason, so it is not left looking outstanding', async () => {
      // 'expired' rather than 'admin_cancelled': nobody withdrew it, it ran out. The
      // invitations list shows the reason, and the two mean different things to an admin.
      const expired = await expiredInvitation();
      await invite('dana@university.edu');

      const after = await prisma.group_invitation.findUnique({ where: { id: expired.id } });
      expect(after.status).toBe(INVITATION_STATUS.CANCELLED);
      expect(after.cancellation_reason).toBe('expired');
      expect(after.cancelled_at).not.toBeNull();
    });

    test('a later invite while the fresh one is open is still already_invited', async () => {
      // Guards the fix from over-correcting: re-inviting is allowed once, not every time.
      await expiredInvitation();
      const fresh = await invite('dana@university.edu');
      const third = await invite('dana@university.edu');

      expect(third.status).toBe('already_invited');
      expect(third.invitation.id).toBe(fresh.invitation.id);
    });
  });

  test('refuses someone who is already in the group', async () => {
    const member = await createTestUser('_inv_member');
    usersToDelete.push(member.id);
    await prisma.group_user.create({ data: { group_id: group.id, user_id: member.subject_id } });

    await expect(invite(member.email)).rejects.toMatchObject({ status: 400 });

    await prisma.group_user.deleteMany({ where: { user_id: member.subject_id } });
  });

  test('refuses an archived group', async () => {
    const archived = await createTestGroup(admin.subject_id, '_inv_archived');
    groupsToDelete.push(archived.id);
    // Through the service. `is_archived` is a denormalisation of an open ARCHIVED
    // restriction, and an invariant test asserts the column and the table agree, so writing
    // the column alone leaves the database in a state that suite reports as broken.
    await groupsService.archiveGroup(archived.id, admin.subject_id);

    await expect(invite('dana@university.edu', { group_id: archived.id }))
      .rejects.toMatchObject({ status: 409 });
  });

  test('an unknown group is a 404, not a foreign key error', async () => {
    // Not the all-zeros uuid, which looks fake and is the seeded "Authenticated Users" group.
    await expect(invite('dana@university.edu', { group_id: randomUUID() }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('listing', () => {
  test('computes is_expired rather than storing it', async () => {
    const { invitation } = await invite('dana@university.edu');
    await prisma.group_invitation.update({
      where: { id: invitation.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const { data } = await invitationService.listInvitations({ group_id: group.id });
    // Still PENDING. Expiry is a condition, not a transition.
    expect(data[0].status).toBe(INVITATION_STATUS.PENDING);
    expect(data[0].is_expired).toBe(true);
  });

  test('reports the total separately from the page', async () => {
    await invite('one@university.edu');
    await invite('two@university.edu');
    await invite('three@university.edu');

    const { metadata, data } = await invitationService.listInvitations({
      group_id: group.id, limit: 2,
    });
    expect(metadata.total).toBe(3);
    expect(data).toHaveLength(2);
  });
});

describe('cancelling', () => {
  test('records why, so an admin can tell it apart from one that lapsed', async () => {
    const { invitation } = await invite('dana@university.edu');
    const cancelled = await invitationService.cancelInvitation({
      group_id: group.id, invitation_id: invitation.id,
    });

    expect(cancelled.status).toBe(INVITATION_STATUS.CANCELLED);
    expect(cancelled.cancellation_reason).toBe('admin_cancelled');
    expect(cancelled.cancelled_at).not.toBeNull();
  });

  test('an admin of another group cannot cancel this one by id', async () => {
    // group_id is part of the match, not only of the authorization above it. Holding the id
    // is otherwise enough.
    const other = await createTestGroup(admin.subject_id, '_inv_other');
    groupsToDelete.push(other.id);
    const { invitation } = await invite('dana@university.edu');

    await expect(invitationService.cancelInvitation({
      group_id: other.id, invitation_id: invitation.id,
    })).rejects.toMatchObject({ status: 404 });

    const untouched = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(untouched.status).toBe(INVITATION_STATUS.PENDING);
  });

  test('cancelling twice is refused rather than silently rewriting the record', async () => {
    // A cancelled invitation is a state the row is in, not a row that is missing, so the second
    // call answers 409. @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
    const { invitation } = await invite('dana@university.edu');
    await invitationService.cancelInvitation({ group_id: group.id, invitation_id: invitation.id });
    await expect(invitationService.cancelInvitation({
      group_id: group.id, invitation_id: invitation.id,
    })).rejects.toMatchObject({ status: 409 });
  });
});

describe('applying what an address is holding', () => {
  /** Run applyPendingInvitations for a user in its own transaction. */
  const apply = (email, user) => prisma.$transaction((tx) => invitationService
    .applyPendingInvitations({ email, user_subject_id: user.subject_id, tx }));

  test('puts the user in the group with the invited role', async () => {
    const dana = await createTestUser('_inv_dana');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email, { role: GROUP_MEMBER_ROLE.ADMIN });

    const { applied } = await apply(dana.email, dana);

    expect(applied).toHaveLength(1);
    const membership = await activeMembership(group.id, dana.subject_id);
    expect(membership.role).toBe(GROUP_MEMBER_ROLE.ADMIN);
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.ACCEPTED);
    expect(after.accepted_at).not.toBeNull();
  });

  test('matches on the normalised address, not the string that was typed', async () => {
    const dana = await createTestUser('_inv_case');
    usersToDelete.push(dana.id);
    await invite(dana.email.toUpperCase());

    const { applied } = await apply(dana.email, dana);
    expect(applied).toHaveLength(1);
  });

  test('applies several invitations independently', async () => {
    const second = await createTestGroup(admin.subject_id, '_inv_second');
    groupsToDelete.push(second.id);
    const dana = await createTestUser('_inv_many');
    usersToDelete.push(dana.id);

    await invite(dana.email);
    await invite(dana.email, { group_id: second.id });

    const { applied } = await apply(dana.email, dana);

    expect(applied.map((a) => a.group_id).sort()).toEqual([group.id, second.id].sort());
    expect(await activeMembership(group.id, dana.subject_id)).not.toBeNull();
    expect(await activeMembership(second.id, dana.subject_id)).not.toBeNull();
  });

  test('a group archived since the invitation was sent is skipped, not fatal', async () => {
    // The account still gets created and the other invitations still apply. The reason is
    // written down so an admin can see why this one was never honoured.
    const archived = await createTestGroup(admin.subject_id, '_inv_gone');
    groupsToDelete.push(archived.id);
    const dana = await createTestUser('_inv_stale');
    usersToDelete.push(dana.id);

    const { invitation: stale } = await invite(dana.email, { group_id: archived.id });
    await invite(dana.email);
    await groupsService.archiveGroup(archived.id, admin.subject_id);

    const { applied, skipped } = await apply(dana.email, dana);

    expect(applied.map((a) => a.group_id)).toEqual([group.id]);
    expect(skipped).toEqual([{ invitation_id: stale.id, reason: 'group_archived' }]);
    const after = await prisma.group_invitation.findUnique({ where: { id: stale.id } });
    expect(after.status).toBe(INVITATION_STATUS.CANCELLED);
    expect(after.cancellation_reason).toBe('group_archived');
  });

  test('an expired invitation is left alone', async () => {
    const dana = await createTestUser('_inv_late');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email);
    await prisma.group_invitation.update({
      where: { id: invitation.id }, data: { expires_at: new Date(Date.now() - 1000) },
    });

    const { applied, skipped } = await apply(dana.email, dana);

    expect(applied).toEqual([]);
    expect(skipped).toEqual([]);
    expect(await activeMembership(group.id, dana.subject_id)).toBeNull();
    // Still PENDING and still expired — nothing needed to run to make that true.
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });

  test('a cancelled invitation is not resurrected', async () => {
    const dana = await createTestUser('_inv_cancelled');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email);
    await invitationService.cancelInvitation({ group_id: group.id, invitation_id: invitation.id });

    const { applied } = await apply(dana.email, dana);
    expect(applied).toEqual([]);
    expect(await activeMembership(group.id, dana.subject_id)).toBeNull();
  });

  test('a withdrawal that lands first is not overwritten', async () => {
    // The race, with the ordering forced: an admin withdraws the invitation after signup has
    // read it and before the membership is written. Withdrawal has to win, or the button
    // promises something the system does not do. Raced for real in
    // invitation.concurrency.test.js.
    const dana = await createTestUser('_inv_withdrawn');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email);
    // The row as applyPendingInvitations read it, before the admin acted.
    await invitationService.cancelInvitation({ group_id: group.id, invitation_id: invitation.id });

    const granted = await prisma.$transaction(
      (tx) => invitationService.grantMembership(tx, invitation, dana.subject_id),
    );

    expect(granted).toBe(false);
    expect(await activeMembership(group.id, dana.subject_id)).toBeNull();
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.CANCELLED);
    expect(after.accepted_at).toBeNull();
  });

  test('an invitation that expires between the read and the write is not spent', async () => {
    // Same guard, the other condition. Expiry is computed, so the row can lapse between
    // reading it and writing it with nothing having changed the row at all.
    const dana = await createTestUser('_inv_lapsed_write');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email);
    await prisma.group_invitation.update({
      where: { id: invitation.id }, data: { expires_at: new Date(Date.now() - 1000) },
    });

    const granted = await prisma.$transaction(
      (tx) => invitationService.grantMembership(tx, invitation, dana.subject_id),
    );

    expect(granted).toBe(false);
    expect(await activeMembership(group.id, dana.subject_id)).toBeNull();
  });

  test('an address holding nothing is a no-op, not an error', async () => {
    const nobody = await createTestUser('_inv_none');
    usersToDelete.push(nobody.id);
    await expect(apply(nobody.email, nobody)).resolves.toEqual({ applied: [], skipped: [] });
  });

  test('an address that is not an address is a no-op', async () => {
    const dana = await createTestUser('_inv_bad');
    usersToDelete.push(dana.id);
    await expect(apply('not-an-email', dana)).resolves.toEqual({ applied: [], skipped: [] });
  });

  test('applying when the user is already a member is idempotent', async () => {
    // Defensive: the invitation closes and no second membership row appears.
    const dana = await createTestUser('_inv_already');
    usersToDelete.push(dana.id);
    await prisma.group_user.create({ data: { group_id: group.id, user_id: dana.subject_id } });
    const { invitation } = await invite('someone-else@university.edu');
    await prisma.group_invitation.update({
      where: { id: invitation.id },
      data: { invited_email: normalizeEmail(dana.email) },
    });

    const { applied } = await apply(dana.email, dana);

    expect(applied).toHaveLength(1);
    const rows = await prisma.group_user.findMany({
      where: { group_id: group.id, user_id: dana.subject_id, removed_at: null },
    });
    expect(rows).toHaveLength(1);
  });

  test('writes an audit record saying the membership came from an invitation', async () => {
    const dana = await createTestUser('_inv_audit');
    usersToDelete.push(dana.id);
    await invite(dana.email);

    await apply(dana.email, dana);

    const records = await prisma.authorization_audit.findMany({
      where: { event_type: 'GROUP_MEMBER_ADDED', subject_id: dana.subject_id },
    });
    expect(records).toHaveLength(1);
    expect(records[0].metadata).toMatchObject({ via: 'invitation' });
  });

  test('nothing commits if the transaction fails afterwards', async () => {
    // The whole reason applyPendingInvitations takes a transaction rather than opening one.
    const dana = await createTestUser('_inv_rollback');
    usersToDelete.push(dana.id);
    const { invitation } = await invite(dana.email);

    await expect(prisma.$transaction(async (tx) => {
      await invitationService.applyPendingInvitations({
        email: dana.email, user_subject_id: dana.subject_id, tx,
      });
      throw new Error('the caller failed after we ran');
    })).rejects.toThrow('the caller failed after we ran');

    expect(await activeMembership(group.id, dana.subject_id)).toBeNull();
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });
});
