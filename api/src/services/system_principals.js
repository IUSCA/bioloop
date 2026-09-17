const createError = require('http-errors');

const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');

/**
 * The system principals `Authenticated Users` and `Public`: groups that are only ever grant subjects.
 *
 * Queries that exclude them in SQL read `SYSTEM_PRINCIPAL_GROUP_IDS` directly. A check on one id
 * goes through here, so every refusal says the same thing about the same groups.
 *
 * @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
 */

/** Why a system principal cannot take each role, completing "…are system groups, so they …". */
const REFUSAL_BY_ROLE = Object.freeze({
  owner: 'cannot own data',
  member: 'have no members',
  parent: 'have no sub-groups',
  affiliation: 'cannot be credited on a dataset',
});

/**
 * Whether a group id is a system principal.
 * @param {string} group_id
 * @returns {boolean}
 */
function isSystemPrincipal(group_id) {
  return SYSTEM_PRINCIPAL_GROUP_IDS.includes(group_id);
}

/**
 * Refuses, with 409, a system principal named in a role only a governed group can take.
 *
 * @param {string} group_id
 * @param {'owner'|'member'|'parent'|'affiliation'} role - the role the caller named the group in
 * @throws {HttpError} 409 when the id is a system principal
 * @throws {Error} when the role is not one this module words a refusal for
 */
function assertNotSystemPrincipal(group_id, role) {
  const refusal = REFUSAL_BY_ROLE[role];
  if (!refusal) throw new Error(`assertNotSystemPrincipal: no refusal defined for role "${role}"`);
  if (isSystemPrincipal(group_id)) {
    throw createError.Conflict(`Authenticated Users and Public are system groups, so they ${refusal}.`);
  }
}

module.exports = {
  isSystemPrincipal,
  assertNotSystemPrincipal,
};
