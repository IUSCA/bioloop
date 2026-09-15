const validator = require('validator');

/**
 * The canonical form of an email address, or null when the input is not an address.
 *
 * Every comparison between two addresses goes through this, and so does every write of one.
 * An invitation is issued to an address and applied by matching it against the address on an
 * account, and those two strings arrive from different places — an admin typing into a box,
 * and an OAuth provider's claim.
 *
 * `validator.normalizeEmail` is deliberately not called on its own anywhere. Given a string
 * that is not an address it returns a mangled string rather than failing: `'not-an-email'`
 * comes back as `'@not-an-email'`, which would then be stored and compared as though it were
 * real. So validity is checked first and a non-address gets null.
 *
 * Normalisation is provider-aware and does more than lowercase. Gmail ignores dots and
 * everything after a plus, so `Dana.Smith+work@gmail.com` and `danasmith@gmail.com` are one
 * mailbox and normalise to one string. The browser cannot reproduce this — it trims and
 * lowercases only — which is a known and bounded imprecision.
 *
 * @see docs/design/groups/implementation/invitations.md — Email Normalization
 * @param {string} email
 * @returns {string|null}
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (!validator.isEmail(trimmed)) return null;
  const normalized = validator.normalizeEmail(trimmed);
  return normalized === false ? null : normalized;
}

module.exports = { normalizeEmail };
