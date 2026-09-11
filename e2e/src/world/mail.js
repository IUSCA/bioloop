/**
 * Reading the development mailbox.
 *
 * Invitation tokens are deliberately not returned by any API: `POST /groups/:id/invitations`
 * answers `{status, id}`, and the list route returns `invited_email` and `status` and no
 * token. The token exists only in the email, which is the correct design and means a test
 * that wants to *spend* an invitation has to read the mail like the invitee would.
 *
 * MailHog is the development SMTP server, and this reads its HTTP API rather than the
 * database, so the suite still never reaches around the product to get a secret.
 *
 * Requires Redis, MailHog, and the notification worker: `docker compose up -d redis mailhog`
 * and `bin/devserver.sh up notifications-worker`. Without the worker the API only enqueues the
 * job and nothing is ever delivered, so these tests fail on a timeout that says nothing about
 * invitations.
 *
 * @see docs/guides/dev-servers.md — Notifications need Redis, MailHog, and the worker
 */

const MAILHOG_BASE = process.env.E2E_MAILHOG_BASE || 'http://localhost:8025';

/** Long enough for the worker to dequeue, render, and send. */
const DELIVERY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

/**
 * Undoes the transport encodings that stand between the body and the link.
 *
 * The body arrives quoted-printable, so `=` is `=3D` and long lines are soft-wrapped with a
 * trailing `=` before the newline. The HTML half additionally escapes `=` as `&#x3D;`. A
 * regex run against the raw body finds a token with characters missing, which then fails to
 * apply and reads as the token being rejected.
 */
function decodeBody(body) {
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=3D/gi, '=')
    .replace(/&#x3D;/gi, '=')
    .replace(/&amp;/gi, '&');
}

async function messages() {
  const res = await fetch(`${MAILHOG_BASE}/api/v2/messages?limit=200`);
  if (!res.ok) {
    throw new Error(
      `MailHog at ${MAILHOG_BASE} answered ${res.status}. `
      + 'Start it with `docker compose up -d mailhog`.',
    );
  }
  return (await res.json()).items || [];
}

function addressesOf(message) {
  return (message.To || []).map((h) => `${h.Mailbox}@${h.Domain}`.toLowerCase());
}

/**
 * A mark to measure "newer than this" against. Take one *before* issuing the invitation.
 *
 * MailHog keeps every message until somebody empties it, so any address that has been invited
 * before — every real seeded account, across every previous run — already has an invitation
 * sitting in the mailbox. Without a mark, `waitForInvitationToken` returns the moment it sees
 * *an* email for the address, which is the old one, because the new one has not been
 * delivered yet. Sorting newest-first does not help: the newest message present is still the
 * stale one until delivery catches up.
 *
 * The stale token then fails to apply with "This invitation is no longer valid", which reads
 * as the invitation system being broken rather than as the test having opened the wrong
 * letter. That cost a debugging cycle; the mark is why it cannot happen again.
 *
 * A second behind the clock, because MailHog timestamps on receipt and the two machines are
 * the same one but the rounding is not.
 */
function mailMark() {
  return Date.now() - 1000;
}

/**
 * Waits for an invitation email to `email` delivered after `since`, and returns its token.
 *
 * Polls rather than reading once, because the send is asynchronous: the API enqueues and the
 * worker delivers, so the invitation row exists well before the mail does.
 */
async function waitForInvitationToken(email, { timeout = DELIVERY_TIMEOUT_MS, since } = {}) {
  const wanted = email.toLowerCase();
  const after = since ?? 0;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const items = await messages();
    const mine = items
      .filter((m) => addressesOf(m).includes(wanted))
      .filter((m) => new Date(m.Created).getTime() >= after)
      .sort((a, b) => new Date(b.Created) - new Date(a.Created));
    for (const message of mine) {
      const found = /\/invite\?token=([A-Za-z0-9._-]+)/.exec(decodeBody(message.Content.Body));
      if (found) return found[1];
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, POLL_INTERVAL_MS); });
  }
  throw new Error(
    `No invitation email for ${email} within ${timeout / 1000}s`
    + `${since ? ' newer than the mark taken before inviting' : ''}. `
    + 'Is the notification worker running? `bin/devserver.sh status`',
  );
}

/** Whether any mail has reached an address at all — for asserting that one was sent. */
async function hasMailFor(email) {
  const wanted = email.toLowerCase();
  return (await messages()).some((m) => addressesOf(m).includes(wanted));
}

module.exports = {
  waitForInvitationToken, hasMailFor, mailMark, MAILHOG_BASE,
};
