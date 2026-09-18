/**
 * The browser's idea of a canonical email address: trimmed and lowercased.
 *
 * Deliberately weaker than the server's. The API uses `validator.normalizeEmail`, which also
 * knows that Gmail ignores dots and everything after a plus, so `Dana.Smith+work@gmail.com`
 * and `danasmith@gmail.com` are one mailbox there and two here.
 *
 * That difference shows in one place. The `/invite` page compares the signed-in account with
 * the invited address before calling `/apply`, to skip a pointless round trip. A pair that
 * differs only by Gmail dots therefore sees the wrong-account message when the server would
 * have accepted them. Pulling a full email-parsing library into the bundle to close that gap
 * is not worth it. The signup page makes no such comparison, because its mismatch warning is
 * not built.
 *
 * The server is the authority. Nothing here decides anything on its own.
 *
 * @see docs/design/groups/invitations.md — Email normalization
 * @see docs/design/groups/invitations.md — Not built
 */
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export default { normalizeEmail };
