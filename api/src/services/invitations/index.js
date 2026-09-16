const { randomBytes } = require('node:crypto');
const config = require('config');
const createError = require('http-errors');
const { Prisma, GROUP_MEMBER_ROLE, INVITATION_STATUS } = require('@prisma/client');

const prisma = require('@/db');
const state = require('@/state');
const logger = require('@/services/logger');
const { normalizeEmail } = require('@/utils/email');
const audit = require('@/authorization/builtin/audit');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');
const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');
const { sendInvitationEmail } = require('./notify');

/**
 * Group invitations: issuing one, cancelling one, and applying the ones an address is
 * holding when its account appears.
 *
 * An invitation names an email address, not a user, because the whole point is to reach
 * someone with no account. That makes the address the join key, and every address that
 * enters or leaves this module passes through `normalizeEmail`.
 *
 * @see docs/design/groups/implementation/invitations.md
 */

/**
 * 256 bits of randomness as 43 base64url characters.
 *
 * Not a JWT. A signed token is self-contained, which buys offline verification and costs a
 * revocation story; an invitation has to be cancellable, so the row is the authority and the
 * token is only a lookup key. 256 bits is the width at which guessing is not a threat model.
 */
function generateInviteToken() {
  return randomBytes(32).toString('base64url');
}

/** When an invitation created now stops working. */
function expiryFromNow() {
  const days = config.get('invitations.ttl_days');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * The `WHERE` that decides whether an invitation may still be used.
 *
 * Expiry is computed here rather than stored as a status, so `expires_at` is the only thing
 * that decides and no job has to catch up with it.
 */
function usableInvitation(extra = {}) {
  return { status: INVITATION_STATUS.PENDING, expires_at: { gt: new Date() }, ...extra };
}

/**
 * Issue an invitation, or report that one is already open.
 *
 * Idempotent on `(group, email)`: asking twice sends one email and returns `already_invited`
 * the second time. The check and the partial unique index are both needed — the check gives
 * the caller a clean answer, the index decides which of two simultaneous admins wins.
 *
 * The response says nothing about whether the address has an account. A group admin who
 * could tell the difference could enumerate the portal's users one address at a time.
 *
 * @param {object} params
 * @param {string} params.group_id
 * @param {string} params.email - as typed; normalised here
 * @param {'MEMBER'|'ADMIN'} [params.role]
 * @param {string} params.invited_by - subject_id of the inviting admin
 * @returns {Promise<{status: 'invited'|'already_invited', invitation: object}>}
 */
async function createInvitation({
  group_id, email, role = GROUP_MEMBER_ROLE.MEMBER, invited_by,
}) {
  const invited_email = normalizeEmail(email);
  if (!invited_email) throw createError.BadRequest('A valid email address is required');

  const result = await prisma.$transaction(async (tx) => {
    const groupRows = await tx.$queryRaw`
      SELECT id, is_archived FROM "group" g WHERE g.id = ${group_id} FOR UPDATE;
    `;
    if (groupRows.length === 0) throw createError.NotFound('Group not found');
    state.assertPossible('group', 'invite', groupRows[0]);

    // Someone who is already in the group does not need asking. Matched on the account's
    // address, normalised the same way the invitation's was.
    const members = await tx.active_group_user.findMany({
      where: { group_id },
      select: { user: { select: { email: true } } },
    });
    if (members.some((m) => normalizeEmail(m.user?.email) === invited_email)) {
      throw createError.BadRequest('That person is already a member of this group');
    }

    const open = await tx.group_invitation.findFirst({
      where: usableInvitation({ group_id, invited_email }),
    });
    if (open) return { status: 'already_invited', invitation: open };

    const [group, inviter] = await Promise.all([
      tx.group.findUnique({ where: { id: group_id }, select: { name: true } }),
      tx.user.findUnique({ where: { subject_id: invited_by }, select: { name: true, username: true } }),
    ]);

    try {
      const invitation = await tx.group_invitation.create({
        data: {
          token: generateInviteToken(),
          group_id,
          invited_email,
          role,
          invited_by,
          expires_at: expiryFromNow(),
        },
      });
      return {
        status: 'invited',
        invitation,
        groupName: group?.name,
        inviterName: inviter?.name || inviter?.username,
      };
    } catch (err) {
      // The other admin got there first, between the read above and this write.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await tx.group_invitation.findFirst({
          where: { group_id, invited_email, status: INVITATION_STATUS.PENDING },
        });
        return { status: 'already_invited', invitation: existing };
      }
      throw err;
    }
  });

  // After the transaction, and unable to fail it. Asking twice sends one message, so only a
  // fresh invitation is announced.
  if (result.status === 'invited') {
    await sendInvitationEmail({
      invitation: result.invitation,
      groupName: result.groupName,
      inviterName: result.inviterName,
    });
  }

  return { status: result.status, invitation: result.invitation };
}

/**
 * One page of a group's invitations, newest first.
 *
 * `is_expired` is computed rather than stored, so a caller filtering for expired invitations
 * asks for `PENDING` and reads the flag.
 *
 * @param {object} params
 * @param {string} params.group_id
 * @param {string} [params.status]
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 * @returns {Promise<{metadata: {total: number}, data: object[]}>}
 */
async function listInvitations({
  group_id, status = INVITATION_STATUS.PENDING, limit = 50, offset = 0,
}) {
  const where = { group_id, ...(status ? { status } : {}) };
  const [total, rows] = await prisma.$transaction([
    prisma.group_invitation.count({ where }),
    prisma.group_invitation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        invited_email: true,
        role: true,
        status: true,
        created_at: true,
        expires_at: true,
        cancellation_reason: true,
        inviter: { select: { name: true, username: true } },
        // An invitation's state rules read the group's archived column as well as the status,
        // so the list selects it and the route answers without a second query.
        // @see src/state/builtin/invitation.js
        group: { select: { is_archived: true } },
      },
    }),
  ]);

  const now = new Date();
  return {
    metadata: { total },
    // The token is never in this response. An admin listing invitations has no business
    // holding the value that accepts one.
    data: rows.map((row) => ({ ...row, is_expired: row.expires_at < now })),
  };
}

/**
 * Withdraw an open invitation.
 *
 * `group_id` is part of the match, not just the authorization. An admin of one group holding
 * another group's invitation id must not be able to cancel it, and the id alone would let
 * them.
 *
 * @param {object} params
 * @param {string} params.group_id
 * @param {string} params.invitation_id
 * @returns {Promise<object>} the cancelled invitation
 */
async function cancelInvitation({ group_id, invitation_id }) {
  return prisma.$transaction(async (tx) => {
    // An invitation that is no longer pending, or a group that has since been archived, is a
    // state rather than a missing row, so it answers 409.
    const invitation = await tx.group_invitation.findFirst({
      where: { id: invitation_id, group_id },
      include: { group: { select: { is_archived: true } } },
    });
    if (!invitation) {
      throw createError.NotFound('No invitation with that id in this group');
    }
    state.assertPossible('invitation', 'cancel', invitation);

    const { count } = await tx.group_invitation.updateMany({
      where: { id: invitation_id, group_id, status: INVITATION_STATUS.PENDING },
      data: {
        status: INVITATION_STATUS.CANCELLED,
        cancelled_at: new Date(),
        cancellation_reason: 'admin_cancelled',
      },
    });
    if (count === 0) {
      throw createError.Conflict('This invitation is no longer pending.');
    }
    return tx.group_invitation.findUnique({ where: { id: invitation_id } });
  });
}

/**
 * Put a user in the group an invitation names, and mark the invitation accepted.
 *
 * Runs inside the caller's transaction. Adding the membership and closing the invitation are
 * one fact, and a crash between them would leave an invitation that can be spent again.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} invitation
 * @param {string} user_subject_id
 * @returns {Promise<void>}
 */
async function grantMembership(tx, invitation, user_subject_id) {
  // ON CONFLICT rather than a read: the partial unique index on an open membership is what
  // actually decides, and a check here would only narrow the race, not close it.
  await tx.$executeRaw`
    INSERT INTO group_user (group_id, user_id, role, assigned_by)
    VALUES (${invitation.group_id}, ${user_subject_id},
            ${invitation.role}::"GROUP_MEMBER_ROLE", ${invitation.invited_by})
    ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING;
  `;

  await tx.group_invitation.update({
    where: { id: invitation.id },
    data: { status: INVITATION_STATUS.ACCEPTED, accepted_at: new Date() },
  });

  const groupName = await resolveEntityName(tx, 'group', invitation.group_id);
  const builder = new AuditBuilder(tx, { actor_id: invitation.invited_by });
  await builder
    .setTarget(audit.TARGET_TYPE.GROUP, invitation.group_id, groupName)
    .mergeMetadata({ role: invitation.role, via: 'invitation' });
  await builder.createBatch(tx, audit.AUTH_EVENT_TYPE.GROUP_MEMBER_ADDED, [{
    subject_id: user_subject_id,
    subject_type: audit.SUBJECT_TYPE.USER,
  }]);
}

/**
 * Apply every usable invitation an address is holding.
 *
 * Called when an account appears for that address. Runs inside the caller's transaction, so
 * an account and its memberships commit together or not at all.
 *
 * A stale invitation does not fail the others or the account. A group archived since the
 * invitation was sent is cancelled with a reason an admin can read, and the rest still apply.
 * A group deleted since is gone with its invitations, by cascade.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.user_subject_id
 * @param {import('@prisma/client').Prisma.TransactionClient} params.tx
 * @returns {Promise<{applied: object[], skipped: object[]}>}
 */
async function applyPendingInvitations({ email, user_subject_id, tx }) {
  const invited_email = normalizeEmail(email);
  if (!invited_email) return { applied: [], skipped: [] };

  const invitations = await tx.group_invitation.findMany({
    where: usableInvitation({ invited_email }),
    include: { group: { select: { id: true, name: true, is_archived: true } } },
  });

  const applied = [];
  const skipped = [];

  for (const invitation of invitations) {
    if (state.check('invitation', 'accept', invitation)) {
      // eslint-disable-next-line no-await-in-loop
      await tx.group_invitation.update({
        where: { id: invitation.id },
        data: {
          status: INVITATION_STATUS.CANCELLED,
          cancelled_at: new Date(),
          cancellation_reason: 'group_archived',
        },
      });
      skipped.push({ invitation_id: invitation.id, reason: 'group_archived' });
      logger.info(`Invitation ${invitation.id} not applied: group ${invitation.group_id} is archived`);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await grantMembership(tx, invitation, user_subject_id);
      applied.push({ invitation_id: invitation.id, group_id: invitation.group_id, group_name: invitation.group.name });
    }
  }

  return { applied, skipped };
}

/**
 * Whether a token can still be spent, without spending it.
 *
 * The answer is `valid` or `invalid` and never says which of expired, cancelled, accepted, or
 * never-existed applies. The caller is unauthenticated, and a reason turns this into an oracle
 * for the state of somebody else's invitation. The reason is logged instead.
 *
 * It also does not say whether the invited address has an account, which would let anyone
 * holding a token enumerate the portal.
 *
 * @param {string} token
 * @returns {Promise<{status: 'valid', email: string}|{status: 'invalid'}>}
 */
async function checkInvitationToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return { status: 'invalid' };
  }

  const invitation = await prisma.group_invitation.findUnique({
    where: { token },
    include: { group: { select: { name: true, is_archived: true } } },
  });

  if (!invitation) {
    logger.info('Invitation check failed: no such token');
    return { status: 'invalid' };
  }
  if (invitation.status !== INVITATION_STATUS.PENDING) {
    logger.info(`Invitation ${invitation.id} check failed: status is ${invitation.status}`);
    return { status: 'invalid' };
  }
  if (invitation.expires_at <= new Date()) {
    logger.info(`Invitation ${invitation.id} check failed: expired ${invitation.expires_at.toISOString()}`);
    return { status: 'invalid' };
  }
  if (state.check('invitation', 'accept', invitation)) {
    logger.info(`Invitation ${invitation.id} check failed: the group is archived`);
    return { status: 'invalid' };
  }

  return { status: 'valid', email: invitation.invited_email, group_name: invitation.group.name };
}

/**
 * Spend a token on behalf of an authenticated user.
 *
 * The invited address lives in the row, so the server decides who a link belongs to and no
 * trust is placed in anything the client says. A forwarded link fails here rather than
 * anywhere earlier.
 *
 * `SELECT ... FOR UPDATE` serialises two tabs racing on the same token: the first spends it,
 * the second finds it no longer `PENDING` and is told so.
 *
 * @param {object} params
 * @param {string} params.token
 * @param {object} params.user - the authenticated user, with `email` and `subject_id`
 * @returns {Promise<{group_id: string, group_name: string, role: string}>}
 */
async function acceptInvitationByToken({ token, user }) {
  const callerEmail = normalizeEmail(user?.email);
  if (!callerEmail) throw createError.Forbidden('This invitation is for a different email address');

  const outcome = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id FROM group_invitation
      WHERE token = ${token} AND status = 'PENDING' AND expires_at > now()
      FOR UPDATE;
    `;
    if (rows.length === 0) throw createError.NotFound('This invitation is no longer valid');

    const invitation = await tx.group_invitation.findUnique({
      where: { id: rows[0].id },
      include: { group: { select: { id: true, name: true, is_archived: true } } },
    });

    // Checked before the group, so that someone holding a forwarded link learns nothing about
    // the group it points at.
    if (invitation.invited_email !== callerEmail) {
      logger.info(`Invitation ${invitation.id} refused: authenticated as a different address`);
      throw createError.Forbidden('This invitation is for a different email address');
    }

    // Reported rather than thrown, because a throw here would roll the transaction back and
    // take the cancellation with it. The invitation is closed afterwards, outside.
    if (state.check('invitation', 'accept', invitation)) {
      return { archived: true, invitation_id: invitation.id };
    }

    // Idempotent for someone who is already a member: the membership insert does nothing and
    // the invitation still closes.
    await grantMembership(tx, invitation, user.subject_id);

    return {
      group_id: invitation.group.id,
      group_name: invitation.group.name,
      role: invitation.role,
    };
  });

  if (outcome.archived) {
    // Closed with a reason rather than left pending, so it stops showing as outstanding to
    // the admin of a group nobody can join any more.
    await prisma.group_invitation.update({
      where: { id: outcome.invitation_id },
      data: {
        status: INVITATION_STATUS.CANCELLED,
        cancelled_at: new Date(),
        cancellation_reason: 'group_archived',
      },
    });
    throw createError.Conflict('The group has been archived since this invitation was sent');
  }

  return outcome;
}

module.exports = {
  generateInviteToken,
  checkInvitationToken,
  acceptInvitationByToken,
  createInvitation,
  listInvitations,
  cancelInvitation,
  applyPendingInvitations,
  grantMembership,
  usableInvitation,
};
