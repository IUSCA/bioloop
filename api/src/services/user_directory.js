const prisma = require('@/db');

/**
 * The user directory as a caller who is not a platform admin may search it.
 *
 * Every surface that opens this search is already held by somebody with governance authority:
 * a group admin, or a platform admin. What it returns is the contact card a university
 * directory already publishes — name, username, email — and nothing about the account as an
 * account. Roles, last login, and login method stay with the platform-admin listing.
 *
 * @see docs/design/groups/user-directory.md — Who may search, and what a search returns
 */

/**
 * The most people one page returns. A legibility and payload bound, not a privacy rule: the
 * pickers ask for ten and a caller may page for the rest.
 */
const MAX_PEOPLE_PER_PAGE = 100;

/** What the pickers ask for when they say nothing. */
const DEFAULT_PEOPLE_PER_PAGE = 10;

/** Name, username, and email. Never a role, a login time, or a login method. */
const DIRECTORY_FIELDS = Object.freeze({
  subject_id: true, name: true, username: true, email: true,
});

/**
 * Accounts that are not deleted whose name, username, or email contains the term.
 *
 * An empty term matches everybody, because a picker that shows nothing until the right
 * prefix is guessed is a picker that cannot be used by somebody who half-remembers a name.
 *
 * @param {Object} params
 * @param {string} [params.search] - any length, including none
 * @param {number} [params.skip]
 * @param {number} [params.take] - capped at `MAX_PEOPLE_PER_PAGE`
 * @returns {Promise<{users: Array<Object>, count: number}>} count is the total match, not the page
 */
async function searchDirectory({ search = '', skip = 0, take = DEFAULT_PEOPLE_PER_PAGE } = {}) {
  const term = (search ?? '').trim();
  const contains = { contains: term, mode: 'insensitive' };
  const where = {
    is_deleted: false,
    ...(term
      ? { OR: [{ name: contains }, { username: contains }, { email: contains }] }
      : {}),
  };

  const [users, count] = await Promise.all([
    prisma.user.findMany({
      where,
      select: DIRECTORY_FIELDS,
      orderBy: { username: 'asc' },
      skip,
      take: Math.min(take, MAX_PEOPLE_PER_PAGE),
    }),
    prisma.user.count({ where }),
  ]);

  return { users, count };
}

module.exports = {
  MAX_PEOPLE_PER_PAGE,
  DEFAULT_PEOPLE_PER_PAGE,
  DIRECTORY_FIELDS,
  searchDirectory,
};
