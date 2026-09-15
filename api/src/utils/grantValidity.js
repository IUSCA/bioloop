/**
 * Whether a grant is in force: started, not expired, and not revoked.
 *
 * This is the predicate of the `valid_grants` view, for rows already in memory. A grant row the
 * API returns carries it as `is_active`, so no client decides activity from raw dates.
 * `tests/services/grants/isActive.test.js` pins it to the view.
 *
 * @param {{valid_from: Date|string, valid_until: Date|string|null, revoked_at: Date|string|null}} grant
 * @param {Date} [now]
 * @returns {boolean}
 * @see docs/design/groups/access-model-verification-plan.md — The UI layer
 */
function isGrantActive(grant, now = new Date()) {
  return new Date(grant.valid_from) <= now
    && (grant.valid_until == null || new Date(grant.valid_until) > now)
    && grant.revoked_at == null;
}

module.exports = { isGrantActive };
