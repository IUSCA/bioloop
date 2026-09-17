const prisma = require('@/db');
const { assertNotSystemPrincipal } = require('@/services/system_principals');

/**
 * Attribution: who to credit for a dataset, and who funded the work.
 *
 * A different relationship from governance. `owner_group_id` says who decides access and
 * nothing else, and keeping the two apart is a standing requirement of decision 8. Nothing
 * here is read by an authorization decision, and adding an affiliation must not widen who
 * can reach a dataset.
 *
 * "Award" rather than "grant" throughout, because `grant` already names an authorization
 * grant everywhere else in this codebase.
 *
 * @see docs/design/groups/decisions.md — 13. Attribution is its own relationship
 */

/**
 * Everything a citation for this dataset needs.
 *
 * @param {number} dataset_row_id
 * @returns {Promise<{funding: Array, affiliations: Array}>}
 */
async function listAttribution(dataset_row_id) {
  const [funding, affiliations] = await Promise.all([
    prisma.dataset_funding.findMany({
      where: { dataset_id: dataset_row_id },
      orderBy: [{ funder: 'asc' }, { award_number: 'asc' }],
    }),
    prisma.dataset_affiliation.findMany({
      where: { dataset_id: dataset_row_id },
      orderBy: { created_at: 'asc' },
      include: { group: { select: { id: true, name: true, slug: true } } },
    }),
  ]);

  return { funding, affiliations };
}

/**
 * Record who funded the work. Recording the same award twice is a mistake rather than a
 * second fact, so a repeat is skipped.
 *
 * @param {number} dataset_row_id
 * @param {Array<{funder: string, award_number?: string, note?: string}>} sources
 * @returns {Promise<number>} how many rows were added
 */
async function recordFunding(dataset_row_id, sources) {
  if (!sources?.length) return 0;

  const { count } = await prisma.dataset_funding.createMany({
    data: sources.map(({ funder, award_number, note }) => ({
      dataset_id: dataset_row_id,
      funder,
      award_number: award_number ?? null,
      note: note ?? null,
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Record an organisation to credit.
 *
 * Exactly one of `group_id` and `organization` may be given, and the group may not be a system
 * principal. A database CHECK enforces each as well. This reports the first as an argument error
 * and the second as a 409, rather than either as a constraint violation.
 *
 * @param {number} dataset_row_id
 * @param {Array<{group_id?: string, organization?: string, role?: string}>} affiliations
 * @returns {Promise<number>} how many rows were added
 */
async function recordAffiliations(dataset_row_id, affiliations) {
  if (!affiliations?.length) return 0;

  affiliations.forEach(({ group_id, organization }) => {
    if ((group_id == null) === (organization == null)) {
      throw new Error('An affiliation names exactly one of a group or an organization');
    }
    assertNotSystemPrincipal(group_id, 'affiliation');
  });

  const { count } = await prisma.dataset_affiliation.createMany({
    data: affiliations.map(({ group_id, organization, role }) => ({
      dataset_id: dataset_row_id,
      group_id: group_id ?? null,
      organization: organization ?? null,
      role: role ?? null,
    })),
  });
  return count;
}

/** Remove one funding row. */
async function removeFunding(id) {
  return prisma.dataset_funding.delete({ where: { id } });
}

/** Remove one affiliation row. */
async function removeAffiliation(id) {
  return prisma.dataset_affiliation.delete({ where: { id } });
}

/**
 * Datasets a funder paid for. The query attribution exists to answer at reporting time.
 *
 * @param {string} funder
 * @param {string} [award_number] - narrows to one award
 */
async function datasetsFundedBy(funder, award_number = undefined) {
  const rows = await prisma.dataset_funding.findMany({
    where: { funder, ...(award_number ? { award_number } : {}) },
    select: { dataset_id: true },
  });
  return [...new Set(rows.map((r) => r.dataset_id))];
}

module.exports = {
  listAttribution,
  recordFunding,
  recordAffiliations,
  removeFunding,
  removeAffiliation,
  datasetsFundedBy,
};
