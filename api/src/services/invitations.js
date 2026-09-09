const { randomBytes } = require('node:crypto');
const config = require('config');
const createError = require('http-errors');
const { Prisma, GROUP_MEMBER_ROLE, INVITATION_STATUS } = require('@prisma/client');

const prisma = require('@/db');
const logger = require('@/services/logger');
const { normalizeEmail } = require('@/utils/email');
const audit = require('@/authorization/builtin/audit');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');
const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');

/**
 * Group invitations: issuing one, cancelling one, and applying the ones an address is
 * holding when its account appears.
 *
 * An invitation names an email address, not a user, because the whole point is to reach
 * someone with no account. That makes the address the join key, and every address that
 * enters or leaves this module passes through `normalizeEmail`.
 *
 * @see docs/design/groups/invitations.md
 */

const ARCHIVED_ERROR_MESSAGE = 'Group is archived';

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

  return prisma.$transaction(async (tx) => {
    const groupRows = await tx.$queryRaw`
      SELECT is_archived FROM "group" g WHERE g.id = ${group_id} FOR UPDATE;
    `;
    if (groupRows.length === 0) throw createError.NotFound('Group not found');
    if (groupRows[0].is_archived) throw createError.Conflict(ARCHIVED_ERROR_MESSAGE);

    // Someone who is already in the group does not need asking. Matched on the account's
    // address, normalised the same way the invitation's was.
    const members = await tx.group_user.findMany({
      where: { group_id, removed_at: null },
      select: { user: { select: { email: true } } },
    });
    if (members.some((m) => normalizeEmail(m.user?.email) === invited_email)) {
      throw createError.BadRequest('That person is already a member of this group');
    }

    const open = await tx.group_invitation.findFirst({
      where: usableInvitation({ group_id, invited_email }),
    });
    if (open) return { status: 'already_invited', invitation: open };

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
      return { status: 'invited', invitation };
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
  const { count } = await prisma.group_invitation.updateMany({
    where: { id: invitation_id, group_id, status: INVITATION_STATUS.PENDING },
    data: {
      status: INVITATION_STATUS.CANCELLED,
      cancelled_at: new Date(),
      cancellation_reason: 'admin_cancelled',
    },
  });
  if (count === 0) {
    throw createError.NotFound('No open invitation with that id in this group');
  }
  return prisma.group_invitation.findUnique({ where: { id: invitation_id } });
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
    if (invitation.group.is_archived) {
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

module.exports = {
  generateInviteToken,
  createInvitation,
  listInvitations,
  cancelInvitation,
  applyPendingInvitations,
  grantMembership,
  usableInvitation,
  ARCHIVED_ERROR_MESSAGE,
};
