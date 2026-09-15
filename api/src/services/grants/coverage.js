const { Prisma, RESOURCE_TYPE } = require('@prisma/client');

const { SYSTEM_PRINCIPAL_GROUP_IDS } = require('@/constants');
const prisma = require('@/db');

const { accessPathsQuery } = require('@/authorization/builtin/accessPaths');
const accessTypeClosure = require('./accessTypeClosure');

const PATH_RESOURCE_TYPE = {
  [RESOURCE_TYPE.DATASET]: 'dataset',
  [RESOURCE_TYPE.COLLECTION]: 'collection',
};

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
 * The rows are the `grant` paths of `accessPathsQuery`, the statement the engine and the lists
 * read, so coverage cannot report a grant the engine would not honour. Each path keeps which
 * grant arrives and through which collection, and the grant's own subject says whether it was
 * held directly, inherited from a group, or granted to a system principal.
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
 * @see docs/design/groups/access-model-verification-plan.md — The rule is a query
 * @param {object} params
 * @param {string} params.subject_id - the user or group the coverage is being computed for
 * @param {string} params.resource_id - the dataset or collection resource id
 * @param {string} params.resource_type - RESOURCE_TYPE.DATASET or RESOURCE_TYPE.COLLECTION
 * @param {number[]} [params.access_type_ids] - restrict to these access types, widened through
 *   the access-type order so a wider grant counts as covering a narrower request; omit for all
 * @returns {Promise<Array>} live grants, each with `via`, `via_group_id`, `access_type_name`
 *   and `access_type_description`
 */
async function getEffectiveCoverage({
  subject_id, resource_id, resource_type, access_type_ids,
}) {
  const resourceType = PATH_RESOURCE_TYPE[resource_type];
  if (!resourceType) throw new Error(`Coverage is not defined for resource type ${resource_type}`);

  // Widen the requirement before filtering. A caller asking about DATASET:LIST_FILES is
  // covered by a lab's grant of DATASET:DOWNLOAD, and matching on the exact type would report
  // that access as new. The rows still carry the access type actually granted.
  // @see docs/design/groups/decisions.md — 7. Access types imply one another
  let accessTypes = null;
  if (access_type_ids?.length) {
    const { nameById } = await accessTypeClosure.getAccessTypeClosure();
    accessTypes = (await accessTypeClosure.satisfiedByIds(access_type_ids)).map((id) => nameById.get(id));
  }

  const rows = await prisma.$queryRaw(Prisma.sql`
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
      gat.description AS access_type_description,
      p.collection_id AS via_collection_id
    FROM (${accessPathsQuery({
    userId: subject_id, resourceType, resourceIds: [resource_id], accessTypes,
  })}) p
    JOIN valid_grants g ON g.id = p.grant_id
    JOIN grant_access_type gat ON gat.id = g.access_type_id
    WHERE p.path_kind = 'grant'
  `);

  return rows.map((row) => {
    let via = COVERAGE_VIA.GROUP;
    if (row.subject_id === subject_id) via = COVERAGE_VIA.DIRECT;
    else if (SYSTEM_PRINCIPAL_GROUP_IDS.includes(row.subject_id)) via = COVERAGE_VIA.PRINCIPAL;
    return { ...row, via, via_group_id: via === COVERAGE_VIA.DIRECT ? null : row.subject_id };
  });
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
