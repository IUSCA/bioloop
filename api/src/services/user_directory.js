const prisma = require('@/db');

/**
 * The user directory as a caller who is not a platform admin may search it.
 *
 * The subject pickers need to find a person, and a directory that lists everyone with roles
 * and login times is enumeration. So the search returns names and addresses only, for a short
 * list of matches, and only once the term is long enough to be about somebody in particular.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 15
 */

/**
 * The shortest search term the directory answers. A privacy rule, not a tuning knob: a shorter
 * term matches most of the directory, so lowering it lets a caller page through everyone.
 */
const SEARCH_LENGTH_BEFORE_DISCLOSURE = 3;

/**
 * The most people one search returns. A privacy rule for the same reason: raising it far
 * enough turns a search into a listing.
 */
const PEOPLE_DISCLOSED_PER_SEARCH = 10;

/**
 * Accounts that are not deleted whose name, username, or email contains the term.
 * @param {Object} params
 * @param {string} params.search - at least `SEARCH_LENGTH_BEFORE_DISCLOSURE` characters
 * @param {number} [params.take] - capped at `PEOPLE_DISCLOSED_PER_SEARCH`
 * @returns {Promise<Array<{subject_id: string, name: string, username: string, email: string}>>}
 */
async function searchDirectory({ search, take = PEOPLE_DISCLOSED_PER_SEARCH }) {
  if (typeof search !== 'string' || search.length < SEARCH_LENGTH_BEFORE_DISCLOSURE) {
    throw new Error(`A directory search needs at least ${SEARCH_LENGTH_BEFORE_DISCLOSURE} characters`);
  }
  const contains = { contains: search, mode: 'insensitive' };
  return prisma.user.findMany({
    where: {
      is_deleted: false,
      OR: [{ name: contains }, { username: contains }, { email: contains }],
    },
    select: {
      subject_id: true, name: true, username: true, email: true,
    },
    orderBy: { username: 'asc' },
    take: Math.min(take, PEOPLE_DISCLOSED_PER_SEARCH),
  });
}

module.exports = {
  SEARCH_LENGTH_BEFORE_DISCLOSURE,
  PEOPLE_DISCLOSED_PER_SEARCH,
  searchDirectory,
};
