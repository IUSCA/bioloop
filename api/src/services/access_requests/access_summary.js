const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { getEffectiveCoverage, labelCoverage } = require('@/services/grants/coverage');

/**
 * What access an approved request actually produced, and how much of it is still live.
 *
 * An APPROVED request whose grants were all revoked reads as access the requester does not
 * have. That is risk 1 in the trust and communication record and the highest-risk case in the
 * design, so no client is asked to infer it: the summary is derived here and travels with the
 * request.
 *
 * The summary is derived, never stored. Grants issued before this work carry no
 * `source_access_request_id`, so it is empty for seeded rows and correct for everything
 * issued from now on.
 *
 * @see docs/design/groups/access-requests-plan.md — C4
 */

/**
 * Counts of the grants each request produced, keyed by request id.
 *
 * One query for a whole page of requests, so a listing pays for one round trip rather than
 * one per row. A request that produced nothing gets a zeroed entry rather than no entry, so
 * a caller never has to decide what a missing key means.
 *
 * @param {string[]} request_ids
 * @returns {Promise<Map<string, object>>} request id → `{issued, live, revoked, expired,
 *   last_revoked_at, last_revocation_type}`
 */
async function getGrantCountsForRequests(request_ids) {
  const empty = () => ({
    issued: 0,
    live: 0,
    revoked: 0,
    expired: 0,
    last_revoked_at: null,
    last_revocation_type: null,
  });

  const summaries = new Map(request_ids.map((id) => [id, empty()]));
  if (request_ids.length === 0) return summaries;

  // A grant is live when nothing has revoked it and its validity has not run out. Those
  // three states are exclusive and exhaustive, so the counts sum to `issued`.
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      g.source_access_request_id AS request_id,
      COUNT(*)::int AS issued,
      COUNT(*) FILTER (
        WHERE g.revoked_at IS NULL
          AND (g.valid_until IS NULL OR g.valid_until > CURRENT_TIMESTAMP)
      )::int AS live,
      COUNT(*) FILTER (WHERE g.revoked_at IS NOT NULL)::int AS revoked,
      COUNT(*) FILTER (
        WHERE g.revoked_at IS NULL AND g.valid_until <= CURRENT_TIMESTAMP
      )::int AS expired,
      MAX(g.revoked_at) AS last_revoked_at
    FROM "grant" g
    WHERE g.source_access_request_id IN (${Prisma.join(request_ids)})
    GROUP BY g.source_access_request_id
  `);

  for (const row of rows) {
    summaries.set(row.request_id, {
      issued: row.issued,
      live: row.live,
      revoked: row.revoked,
      expired: row.expired,
      last_revoked_at: row.last_revoked_at,
      last_revocation_type: null,
    });
  }

  // Why the last revocation happened, which the aggregate above cannot carry. Only requests
  // that had something revoked need this, so it is a second, narrower query.
  const revokedIds = [...summaries.entries()]
    .filter(([, summary]) => summary.revoked > 0)
    .map(([id]) => id);

  if (revokedIds.length > 0) {
    const reasons = await prisma.$queryRaw(Prisma.sql`
      SELECT DISTINCT ON (g.source_access_request_id)
        g.source_access_request_id AS request_id,
        g.revocation_type
      FROM "grant" g
      WHERE g.source_access_request_id IN (${Prisma.join(revokedIds)})
        AND g.revoked_at IS NOT NULL
      ORDER BY g.source_access_request_id, g.revoked_at DESC
    `);
    for (const row of reasons) {
      summaries.get(row.request_id).last_revocation_type = row.revocation_type;
    }
  }

  return summaries;
}

/**
 * Attach `access_summary` to each request in a listing.
 *
 * @param {Array} requests - access_request rows
 * @returns {Promise<Array>} the same rows, each with `access_summary`
 */
async function withGrantCounts(requests) {
  const summaries = await getGrantCountsForRequests(requests.map((r) => r.id));
  return requests.map((request) => ({
    ...request,
    access_summary: summaries.get(request.id),
  }));
}

/**
 * The listing summary for one request, plus what reaches the subject by some other path.
 *
 * An approved item writes no grant when a broader one already covers it, so a request can
 * read as APPROVED with nothing issued and the subject still hold the access. The detail
 * surface says which, and the listings do not, because answering it costs a query per
 * request and a listing would pay it once per row.
 *
 * @param {object} request - an access_request with `access_request_items` and `resource`
 * @returns {Promise<object>} `access_summary`, with `covered_elsewhere`
 */
async function getAccessSummaryForRequest(request) {
  const summaries = await getGrantCountsForRequests([request.id]);
  const summary = summaries.get(request.id);

  // An approved item names either one access type or a preset. A preset item leaves
  // `access_type_id` null and carries its types under `preset.access_type_items`, so reading
  // only the direct column answers the coverage question for no preset request at all.
  const approvedAccessTypeIds = [...new Set(
    (request.access_request_items ?? [])
      .filter((item) => item.decision === 'APPROVED')
      .flatMap((item) => (item.access_type_id != null
        ? [item.access_type_id]
        : (item.preset?.access_type_items ?? []).map((i) => i.access_type_id))),
  )];

  if (approvedAccessTypeIds.length === 0) {
    return { ...summary, covered_elsewhere: [] };
  }

  const coverage = await getEffectiveCoverage({
    subject_id: request.subject_id,
    resource_id: request.resource_id,
    resource_type: request.resource.type,
    access_type_ids: approvedAccessTypeIds,
  });

  // Only the paths this request did not create. A grant this request issued is already
  // counted above, and naming it here would double-count it for the reader.
  const fromElsewhere = coverage.filter((row) => row.source_access_request_id !== request.id);

  return { ...summary, covered_elsewhere: await labelCoverage(fromElsewhere) };
}

module.exports = {
  getGrantCountsForRequests,
  withGrantCounts,
  getAccessSummaryForRequest,
};
