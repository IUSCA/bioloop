/**
 * The browser's idea of a canonical email address: trimmed and lowercased.
 *
 * Deliberately weaker than the server's. The API uses `validator.normalizeEmail`, which also
 * knows that Gmail ignores dots and everything after a plus, so `Dana.Smith+work@gmail.com`
 * and `danasmith@gmail.com` are one mailbox there and two here.
 *
 * That difference shows in exactly one place, and it is bounded. The signup page warns before
 * submitting when the account someone signed in with does not match the address an invitation
 * went to, and that comparison happens before they are authenticated, so no server-side answer
 * exists yet. A pair differing only by Gmail dots therefore sees the warning when the server
 * would have accepted them, and the dialog's "continue without joining" is the way out.
 * Pulling a full email-parsing library into the bundle to close a gap that costs one extra
 * click is not worth it.
 *
 * The server is the authority. Nothing here decides anything on its own.
 */
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export default { normalizeEmail };
