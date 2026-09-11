const { test, expect } = require('../../fixtures');
const { expectForbidden } = require('../../assertions/parity');
const { grantsFromRequest } = require('../../world/grants');

/**
 * Phase 3 — the request loop.
 *
 * The journey the access model exists to serve: somebody who can see a dataset and not read
 * it asks, somebody with the authority decides, and both sides afterwards read the same
 * truth. G5 is the one worth keeping honest — an approval that no longer confers anything
 * must never render as an approval alone.
 *
 * Each test names its own `lockedFor*` dataset. The API refuses a second pending request for
 * an access type already asked for, and refuses a redundant one for access already held, so
 * sharing a dataset would make one test's leftovers decide whether the next can begin.
 *
 * @see docs/design/groups/e2e-test-flows.md — G1, G2, G5, G6, G8
 */

/** An expiry that never lapses, in the shape `Expiry.fromJSON` accepts. */
const NEVER = { type: 'never', value: null };

/**
 * Files a request as Frank for the read plane of one dataset, and reads it back.
 *
 * `submit: true` creates and submits in one transaction, which is what the browser does —
 * `useRequestAccessForm.js` sends the same flag. Without it the row stays in DRAFT, and no
 * surface lists a DRAFT, so the requester can neither see it nor resume it. That is exactly
 * the state G1's "and never" forbids.
 */
async function fileRequest(world, frank, datasetKey, purpose) {
  await frank.api.post('/access-requests', {
    type: 'NEW',
    resource_id: world.datasets[datasetKey].resource_id,
    subject_id: world.people.frank.subject_id,
    purpose,
    items: [{
      access_type_id: world.accessTypes['DATASET:LIST_FILES'],
      requested_expiry: NEVER,
    }],
    submit: true,
  });

  // Read it back from the requester's own page rather than trusting the create response,
  // because what that page shows is itself under test.
  const mine = await frank.api.get('/access-requests/requested-by-me?limit=100');
  const found = mine.data.find((r) => r.purpose === purpose);
  expect(found, 'the request Frank just filed is absent from his own list').toBeTruthy();
  return found;
}

/**
 * Alice decides every item of a request the same way.
 *
 * `approved_expiry` is required on an APPROVED decision even though the route's validator
 * does not say so: the handler calls `Expiry.fromJSON` on it unconditionally. Omitting it
 * answers 500 rather than 400 — filed as L2 T18.
 */
async function decide(alice, request, decision, reason) {
  const full = await alice.api.get(`/access-requests/${request.id}`);
  const items = full.access_request_items || [];
  expect(items.length, 'the request carries no items to decide').toBeGreaterThan(0);

  await alice.api.post(`/access-requests/${request.id}/review`, {
    item_decisions: items.map((i) => ({
      id: i.id,
      decision,
      ...(decision === 'APPROVED' ? { approved_expiry: NEVER } : {}),
    })),
    decision_reason: reason,
  });
  return alice.api.get(`/access-requests/${request.id}`);
}

test('G1 — the whole loop, and the grant names the request that made it', async ({ world, as }) => {
  const [frank, alice] = await Promise.all([as('frank'), as('alice')]);
  const dataset = world.datasets.lockedForApproval;

  // The premise, asserted rather than assumed: Frank sees the dataset and is refused its
  // files. A request for access already held would prove nothing.
  await expectForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  const filed = await fileRequest(world, frank, 'lockedForApproval', 'G1: the whole loop.');
  expect(filed.status).toBe('UNDER_REVIEW');

  // It reaches the owning admin's queue. Alice administers the lab that owns the dataset.
  const queue = await alice.api.get('/access-requests/my-pending-reviews?limit=100');
  expect(queue.data.map((r) => r.id)).toContain(filed.id);

  const decided = await decide(alice, filed, 'APPROVED', 'G1: approved for the run.');
  expect(decided.status).toBe('APPROVED');

  // The access actually arrives. This is what separates a status change from a grant, and it
  // is the model's whole claim about what approving a request means.
  const after = await frank.api.status('GET', `/v2/datasets/${dataset.resource_id}/files`);
  expect(after, 'approval did not confer access to the file plane').not.toBe(403);

  // And the grant names the request that produced it, so the two surfaces cannot drift.
  const sourced = await grantsFromRequest(alice.api, dataset.resource_id, filed.id);
  expect(sourced.length, 'no grant on the dataset names the request that produced it')
    .toBeGreaterThan(0);
});

test('G2 — a rejection carries its reason, verbatim', async ({ world, as }) => {
  const [frank, alice] = await Promise.all([as('frank'), as('alice')]);
  const dataset = world.datasets.lockedForRejection;
  const reason = 'G2: declined because the cohort agreement does not cover this use.';

  const filed = await fileRequest(world, frank, 'lockedForRejection', 'G2: a rejection.');
  const decided = await decide(alice, filed, 'REJECTED', reason);
  expect(decided.status).toBe('REJECTED');

  // Verbatim, on the requester's own view. A reason only the reviewer can read is no reason.
  const mine = await frank.api.get(`/access-requests/${filed.id}`);
  expect(mine.decision_reason).toBe(reason);

  // And no access followed.
  await expectForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);
});

test('G5 — approved does not mean current', async ({ world, as }) => {
  const [frank, alice] = await Promise.all([as('frank'), as('alice')]);
  const dataset = world.datasets.lockedForRevocation;

  const filed = await fileRequest(world, frank, 'lockedForRevocation', 'G5: approved, then revoked.');
  await decide(alice, filed, 'APPROVED', 'G5: approved, and revoked immediately after.');

  // The summary while the approval is still in force. Asserted before anything is revoked,
  // because without it the check below passes against a page that says "revoked" always.
  // The first version of this test matched /revoked/ over the whole summary and went green
  // on `"revoked": 0`, which is the failure it was written to catch.
  const before = await frank.api.get(`/access-requests/${filed.id}`);
  expect(before.access_summary.live, 'the approval conferred nothing to begin with').toBe(1);
  expect(before.access_summary.revoked).toBe(0);
  expect(before.access_summary.last_revoked_at).toBeNull();

  const sourced = await grantsFromRequest(alice.api, dataset.resource_id, filed.id);
  expect(sourced.length, 'the approval produced no grant to revoke').toBeGreaterThan(0);

  for (const grant of sourced) {
    // eslint-disable-next-line no-await-in-loop
    await alice.api.post(`/grants/${grant.id}/revoke`, {
      revocation_reason: 'G5: revoked to prove the request page says so.',
    });
  }

  // The access is gone. This is the half that makes the rest of the flow matter.
  await expectForbidden(frank.api, 'GET', `/v2/datasets/${dataset.resource_id}/files`);

  const after = await frank.api.get(`/access-requests/${filed.id}`);

  // The request still reads approved. That is the historical fact and it is not edited.
  expect(after.status).toBe('APPROVED');

  // And beside it the summary states plainly that nothing from it is in force, with the date
  // of the last revocation — which is what the page needs in order to say so. Rendering the
  // approval alone is the highest-risk failure in the design: the requester believes they
  // hold access they do not.
  expect(after.access_summary.issued, 'the summary forgot the approval ever issued').toBe(1);
  expect(after.access_summary.live, 'the summary still reports live access after revocation').toBe(0);
  expect(after.access_summary.revoked).toBe(1);
  expect(after.access_summary.last_revoked_at, 'no date for the last revocation').toBeTruthy();
  expect(new Date(after.access_summary.last_revoked_at).getTime()).toBeGreaterThan(0);
});

test('G6 — one page lists every request the requester has filed', async ({ world, as }) => {
  const frank = await as('frank');

  const first = await fileRequest(world, frank, 'lockedForHistoryA', 'G6: the first of two.');
  const second = await fileRequest(world, frank, 'lockedForHistoryB', 'G6: the second of two.');

  // Across every resource, which is the part that makes it a history rather than a per-page
  // widget: the two requests are against different datasets.
  expect(first.resource_id).not.toBe(second.resource_id);

  const mine = await frank.api.get('/access-requests/requested-by-me?limit=100');
  const ids = mine.data.map((r) => r.id);
  expect(ids).toContain(first.id);
  expect(ids).toContain(second.id);

  for (const row of mine.data) {
    expect(row.status, `a request on Frank's own page has no status: ${row.id}`).toBeTruthy();
  }
});

test('G8 — withdrawal is the requester\'s alone', async ({ world, as }) => {
  const [frank, alice] = await Promise.all([as('frank'), as('alice')]);
  const filed = await fileRequest(world, frank, 'lockedForWithdrawal', 'G8: withdrawal.');

  // Alice may decide it and may not withdraw it. Deciding is her power, withdrawing is not,
  // and that difference is the whole of the flow.
  await expectForbidden(alice.api, 'POST', `/access-requests/${filed.id}/withdraw`);

  await frank.api.post(`/access-requests/${filed.id}/withdraw`);
  const after = await frank.api.get(`/access-requests/${filed.id}`);
  expect(after.status).toBe('WITHDRAWN');
});
