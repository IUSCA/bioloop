const logger = require('@/services/logger');
const { applyPendingInvitations } = require('./index');

/**
 * Apply an address's pending invitations the moment its account appears.
 *
 * Registered against `hooks.USER_CREATED` in `services/hooks/subscribers.js`, so that
 * `services/user.js` stays unaware that invitations exist. Every path that creates an
 * account — signup, the admin endpoint, and the auto-signup branch that runs the first time
 * someone arrives through the institution's identity provider — goes through `createUser`
 * and therefore through this, without any of them being edited.
 *
 * Runs inside the caller's transaction. A failure here rolls the account back too, which is
 * the atomicity the design asks for: a user must never exist holding invitations that were
 * half applied.
 *
 * @see docs/design/groups/implementation/invitations.md — User provisioning
 * @param {object} params
 * @param {object} params.user - the row just created
 * @param {import('@prisma/client').Prisma.TransactionClient} params.tx
 * @returns {Promise<void>}
 */
async function applyInvitationsForNewUser({ user, tx }) {
  const { applied, skipped } = await applyPendingInvitations({
    email: user.email,
    user_subject_id: user.subject_id,
    tx,
  });

  if (applied.length || skipped.length) {
    logger.info(
      `New account ${user.username}: ${applied.length} invitation(s) applied, `
      + `${skipped.length} skipped`,
    );
  }
}

module.exports = { applyInvitationsForNewUser };
