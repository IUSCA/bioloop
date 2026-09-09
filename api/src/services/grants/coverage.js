const { Prisma, RESOURCE_TYPE } = require('@prisma/client');

const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const prisma = require('@/db');

// How a grant reaches the subject it covers. The order is the order a reader should be told
// them in: what the subject holds itself, then what it inherits, then what everyone has.
const COVERAGE_VIA = Object.freeze({
  DIRECT: 'DIRECT',
  GROUP: 'GROUP',
  PRINCIPAL: 'PRINCIPAL',
});

/**
 * Every live grant that reaches one subject on one resource, and how each one arrives.
 *
 * The authorization layer has always read access this way. `userDatasetsQuery` unions the
 * user's own subject id with their effective groups, the system principals, and any collection
 * holding the dataset, then asks whether any grant matches. This answers the same question and
 * keeps the paths apart, so a caller can say which grant arrives from where.
 *
 * Two callers need that. A reviewer deciding an access request should see that the requester's
 * lab already holds the access, so they can decline as redundant rather than issue a grant that
 * changes nothing. A requester filling in a form should see the same thing before asking.
 *
 * This is advisory and never a write path. Grants are issued to one subject, and a group's
 * grant cannot be superseded when approving one of its members, so the exact-subject match in
 * `fetchExistingGrants` stays as it is.
 *
 * @see docs/design/groups/access-requests-plan.md — C1
 * @param {object} params
 * @param {string} params.subject_id - the user or group the coverage is being computed for
 * @param {string} params.resource_id - the dataset or collection resource id
 * @param {string} params.resource_type - RESOURCE_TYPE.DATASET or RESOURCE_TYPE.COLLECTION
 * @param {number[]} [params.access_type_ids] - restrict to these access types; omit for all
 * @returns {Promise<Array>} live grants, each with `via`, `via_group_id`, and `access_type_name`
 */
async function getEffectiveCoverage({
  subject_id, resource_id, resource_type, access_type_ids,
}) {
  // A user subject inherits from the groups it belongs to and their ancestors; a group subject
  // inherits from its own ancestors. Both arms run, and the one that does not apply to this
  // subject returns no rows, so no branch on subject type is needed.
  const principalArms = SYSTEM_PRINCIPAL_GROUP_IDS
    .map((id) => Prisma.sql`SELECT ${id} AS subject_id, ${COVERAGE_VIA.PRINCIPAL} AS via`);

  const subjects = Prisma.sql`
    SELECT ${subject_id} AS subject_id, ${COVERAGE_VIA.DIRECT} AS via
    UNION
    SELECT group_id, ${COVERAGE_VIA.GROUP}
    FROM effective_user_groups
    WHERE user_id = ${subject_id}
    UNION
    SELECT ancestor_id, ${COVERAGE_VIA.GROUP}
    FROM group_closure
    WHERE descendant_id = ${subject_id} AND depth > 0
    UNION
    ${Prisma.join(principalArms, ' UNION ')}
  `;

  // A grant on a collection confers on the datasets it holds, so a dataset is covered by
  // grants on itself and on every collection currently containing it. A collection is covered
  // only by grants on itself.
  const resources = resource_type === RESOURCE_TYPE.COLLECTION
    ? Prisma.sql`SELECT ${resource_id} AS resource_id`
    : Prisma.sql`
      SELECT ${resource_id} AS resource_id
      UNION
      SELECT collection_id
      FROM active_collection_dataset
      WHERE dataset_id = ${resource_id}
    `;

  const accessTypeFilter = access_type_ids?.length
    ? Prisma.sql`WHERE g.access_type_id IN (${Prisma.join(access_type_ids)})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw(Prisma.sql`
    WITH covering_subjects AS (${subjects}),
    covered_resources AS (${resources})
    SELECT
      g.id,
      g.subject_id,
      g.resource_id,
      g.access_type_id,
      g.valid_from,
      g.valid_until,
      g.source_access_request_id,
      g.source_preset_id,
      gat.name AS access_type_name,
      cs.via,
      CASE WHEN cs.via = ${COVERAGE_VIA.DIRECT} THEN NULL ELSE cs.subject_id END AS via_group_id,
      CASE WHEN g.resource_id = ${resource_id} THEN NULL ELSE g.resource_id END AS via_collection_id
    FROM valid_grants g
    JOIN covering_subjects cs ON g.subject_id = cs.subject_id
    JOIN covered_resources cr ON g.resource_id = cr.resource_id
    JOIN grant_access_type gat ON g.access_type_id = gat.id
    ${accessTypeFilter}
  `);

  // The same grant can arrive on two arms — a direct group membership and an ancestor of that
  // group both name the same group id. Keep the strongest path per grant, in COVERAGE_VIA order.
  const strongest = new Map();
  const rank = { DIRECT: 0, GROUP: 1, PRINCIPAL: 2 };
  for (const row of rows) {
    const held = strongest.get(row.id);
    if (!held || rank[row.via] < rank[held.via]) strongest.set(row.id, row);
  }
  return [...strongest.values()];
}

/**
 * The names of the groups and collections a coverage list arrives through, for display.
 *
 * Kept separate from the query so the query stays a single statement. Callers that only need
 * to know whether coverage exists never pay for it.
 *
 * @param {Array} coverage - rows from getEffectiveCoverage
 * @returns {Promise<Array>} the same rows, with `via_group_name` and `via_collection_name`
 */
async function labelCoverage(coverage) {
  const groupIds = [...new Set(coverage.map((c) => c.via_group_id).filter(Boolean))];
  const collectionIds = [...new Set(coverage.map((c) => c.via_collection_id).filter(Boolean))];
  if (groupIds.length === 0 && collectionIds.length === 0) return coverage;

  const [groups, collections] = await Promise.all([
    groupIds.length
      ? prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })
      : [],
    collectionIds.length
      ? prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, name: true },
      })
      : [],
  ]);

  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const collectionNames = new Map(collections.map((c) => [c.id, c.name]));

  return coverage.map((row) => ({
    ...row,
    via_group_name: row.via_group_id ? groupNames.get(row.via_group_id) ?? null : null,
    via_collection_name: row.via_collection_id
      ? collectionNames.get(row.via_collection_id) ?? null
      : null,
  }));
}

module.exports = { getEffectiveCoverage, labelCoverage, COVERAGE_VIA };
