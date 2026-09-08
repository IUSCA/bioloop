const { Prisma } = require('@prisma/client');
const createError = require('http-errors');

const { AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID } = require('@/constants');

/**
 * A derived dataset is never reachable by a wider audience than its sources.
 *
 * Checked when a grant is issued. `dataset_hierarchy` records which dataset came from
 * which, and nothing else connects that to authorization, so without this a derivative of
 * restricted data could be granted to the world while its source stayed private.
 *
 * @see docs/design/groups/use-cases.md — use case 58
 */

/**
 * How wide an audience a subject represents. Higher is wider.
 *
 * Every dataset is reachable by its owning group's admins whether or not a grant says so,
 * so SCOPED is the floor and a grant to a group or a user can never be too open. Only the
 * two system principals widen a dataset beyond the people already entitled to see it,
 * which is why they are the only subjects this check can refuse.
 */
const OPENNESS = {
  SCOPED: 0,
  AUTHENTICATED: 1,
  PUBLIC: 2,
};

function opennessOfSubject(subject_id) {
  if (subject_id === PUBLIC_GROUP_ID) return OPENNESS.PUBLIC;
  if (subject_id === AUTHENTICATED_USERS_GROUP_ID) return OPENNESS.AUTHENTICATED;
  return OPENNESS.SCOPED;
}

/**
 * Every dataset this one was derived from, directly or through a chain of derivations.
 *
 * Transitive rather than direct, because the rule is checked at issue time only: a source's
 * own grants can be widened after its derivative was granted, and walking the whole chain
 * means a derivative two steps down cannot escape through a middle dataset nobody looked
 * at. UNION rather than UNION ALL, so a cycle in the graph terminates.
 */
function sourceDatasetsQuery(dataset_id) {
  return Prisma.sql`
    WITH RECURSIVE sources AS (
      SELECT dh.source_id
      FROM dataset_hierarchy dh
      WHERE dh.derived_id = ${dataset_id}

      UNION

      SELECT dh.source_id
      FROM dataset_hierarchy dh
      JOIN sources s ON dh.derived_id = s.source_id
    )
    SELECT d.id, d.name, d.resource_id
    FROM sources
    JOIN dataset d ON d.id = sources.source_id
  `;
}

/**
 * Refuse a grant that would make a derived dataset reachable by a wider audience than any
 * of its sources.
 *
 * A grant to a group or a user is always allowed, because the owning group already reaches
 * every dataset and a scoped grant cannot widen a dataset past that floor. A grant to a
 * system principal is allowed only when every source is already at least that open, so a
 * derivative with several sources takes the narrowest of them.
 *
 * @param {Object} tx - Prisma transaction client
 * @param {Object} params
 * @param {string} params.resource_id
 * @param {string} params.subject_id
 * @throws {createError.Conflict} naming the source that is not open enough
 */
async function assertNotMoreOpenThanSources(tx, { resource_id, subject_id }) {
  const wanted = opennessOfSubject(subject_id);
  if (wanted === OPENNESS.SCOPED) return;

  const dataset = await tx.dataset.findUnique({
    where: { resource_id },
    select: { id: true, name: true },
  });
  // Collections are not in dataset_hierarchy, so there is nothing to check for them.
  if (!dataset) return;

  const sources = await tx.$queryRaw(sourceDatasetsQuery(dataset.id));
  if (sources.length === 0) return;

  // A source counts as open at a level if it has an unrevoked, currently valid grant to a
  // principal at least that wide.
  const acceptableSubjects = wanted === OPENNESS.PUBLIC
    ? [PUBLIC_GROUP_ID]
    : [PUBLIC_GROUP_ID, AUTHENTICATED_USERS_GROUP_ID];

  const openSourceIds = new Set(
    (await tx.$queryRaw(Prisma.sql`
      SELECT DISTINCT d.id
      FROM valid_grants g
      JOIN dataset d ON d.resource_id = g.resource_id
      WHERE d.id IN (${Prisma.join(sources.map((s) => s.id))})
        AND g.subject_id IN (${Prisma.join(acceptableSubjects)})
    `)).map((row) => row.id),
  );

  const tooNarrow = sources.find((s) => !openSourceIds.has(s.id));
  if (tooNarrow) {
    const audience = wanted === OPENNESS.PUBLIC ? 'the public' : 'all authenticated users';
    throw createError.Conflict(
      `Cannot grant ${dataset.name} to ${audience}: it is derived from ${tooNarrow.name}, `
      + 'which is not shared that widely. Widen the source first, or grant to a group.',
    );
  }
}

module.exports = {
  OPENNESS,
  opennessOfSubject,
  sourceDatasetsQuery,
  assertNotMoreOpenThanSources,
};
