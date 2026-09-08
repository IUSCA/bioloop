const prisma = require('@/db');

/**
 * Consent codes recorded on datasets.
 *
 * Nothing here is consulted by an authorization decision, by decision rather than by
 * omission. The rows exist because "what did the donor agree to?" is a question that gets
 * asked about data already held, and the answer decays if it is not captured at ingest.
 *
 * @see docs/design/groups/decisions.md — 9. Consent codes are captured, not enforced
 */

/**
 * The conditions recorded on a dataset.
 * @param {number} dataset_id
 */
async function listUseConditions(dataset_id) {
  return prisma.dataset_use_condition.findMany({
    where: { dataset_id },
    orderBy: [{ system: 'asc' }, { code: 'asc' }],
  });
}

/**
 * Record conditions on a dataset that already exists, for the case where they arrive after
 * registration. Recording the same code twice is a mistake rather than a second fact, so a
 * repeat is skipped rather than duplicated.
 *
 * @param {number} dataset_id
 * @param {Array<{system: string, code: string, label?: string, note?: string}>} conditions
 * @param {string} [recorded_by] - subject_id
 * @returns {Promise<number>} how many rows were added
 */
async function recordUseConditions(dataset_id, conditions, recorded_by = null) {
  if (!conditions?.length) return 0;

  const { count } = await prisma.dataset_use_condition.createMany({
    data: conditions.map(({
      system, code, label, note,
    }) => ({
      dataset_id,
      system,
      code,
      label: label ?? null,
      note: note ?? null,
      recorded_by,
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Datasets carrying a given condition. This is the query the table exists for: somebody
 * asks which held data was collected under a particular consent, and the answer has to
 * come from recorded codes rather than from paperwork.
 *
 * @param {string} system
 * @param {string} code
 */
async function datasetsWithUseCondition(system, code) {
  const rows = await prisma.dataset_use_condition.findMany({
    where: { system, code },
    select: { dataset_id: true },
  });
  return rows.map((r) => r.dataset_id);
}

module.exports = {
  listUseConditions,
  recordUseConditions,
  datasetsWithUseCondition,
};
