const config = require('config');

const logger = require('@/services/logger');
const notify = require('@/notification/NotificationService');

/**
 * The invitation email.
 *
 * Email only. `NotificationService` writes an in-app row as well when a `userId` comes with
 * the call, and there is deliberately no `userId` here: the recipient usually has no account
 * to read one, which is the whole point of an invitation.
 *
 * Best-effort, and called after the transaction has committed. A message that cannot be sent
 * must not undo the invitation — the row exists, an admin can see it pending, and the link
 * works whenever the message arrives.
 *
 * @see docs/design/groups/invitations.md — Authorization
 */

/** Where the /invite page lives, or null when nobody has configured a portal URL. */
function portalBaseUrl() {
  const base = config.has('portal.base_url') ? config.get('portal.base_url') : '';
  return base ? base.replace(/\/+$/, '') : null;
}

/** The link that accepts this invitation. */
function acceptUrl(token) {
  const base = portalBaseUrl();
  return base ? `${base}/invite?token=${encodeURIComponent(token)}` : null;
}

/**
 * Send one invitation email.
 *
 * @param {object} params
 * @param {object} params.invitation - the row, including its token
 * @param {string} params.groupName
 * @param {string} params.inviterName
 * @returns {Promise<boolean>} whether the message was queued
 */
async function sendInvitationEmail({ invitation, groupName, inviterName }) {
  const url = acceptUrl(invitation.token);
  if (!url) {
    // Refused rather than sent with a broken link. Naming the setting is the whole value of
    // the message: a relative link in an email goes nowhere and says nothing about why.
    logger.error(
      `Invitation ${invitation.id} email not sent: portal.base_url is not configured, `
      + 'so the accept link cannot be built. Set PORTAL_BASE_URL.',
    );
    return false;
  }

  try {
    await notify.sendInvite({
      to: [invitation.invited_email],
      subject: `You've been invited to join ${groupName}`,
      groupName,
      inviterName,
      // Title case, because this is read by a person rather than compared to an enum.
      role: invitation.role === 'ADMIN' ? 'Admin' : 'Member',
      acceptUrl: url,
      expiresInDays: config.get('invitations.ttl_days'),
    });
    return true;
  } catch (err) {
    logger.error(`Invitation ${invitation.id} email could not be queued: ${err.message}`);
    return false;
  }
}

module.exports = { sendInvitationEmail, acceptUrl };
