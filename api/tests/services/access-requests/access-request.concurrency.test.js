/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */

/**
 * access-request.concurrency.test.js
 *
 * Tests concurrent operations on the same access request, verifying that
 * the OCC guards (`WHERE status = ...` with `updateMany` count checks) enforce
 * exactly-once semantics on every state transition.
 *
 * Scenarios:
 *  1. Concurrent submit of the same DRAFT request → exactly 1 succeeds
 *  2. Concurrent review of the same UNDER_REVIEW request → exactly 1 succeeds
 *  3. Review vs withdraw race → exactly 1 wins
 *  4. Concurrent withdraw attempts → exactly 1 succeeds
 *  5. Sequential duplicate submit for same resource + access type → 2nd fails
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const arService = require('@/services/access_requests');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteUser,
  deleteGroup,
  deleteDataset,
} = require('../helpers');

let requester;
let reviewer;
let ownerGroup;
let dataset;
let viewMetadataTypeId;
let downloadTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];
const arIds = [];

beforeAll(async () => {
  requester = await createTestUser('_arc_req');
  reviewer = await createTestUser('_arc_rev');
  userIds.push(requester.id, reviewer.id);

  ownerGroup = await createTestGroup(reviewer.id, '_arc_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_arc_ds');
  datasetIds.push(dataset.id);

  [viewMetadataTypeId, downloadTypeId] = await Promise.all([
    getAccessTypeId('VIEW_METADATA', 'DATASET').then((t) => t.id),
    getAccessTypeId('DOWNLOAD', 'DATASET').then((t) => t.id),
  ]);
}, 30_000);

afterAll(async () => {
  for (const id of arIds) {
    await prisma.access_request.deleteMany({ where: { id } }).catch(() => {});
  }
  // Revoke all grants created during tests
  await prisma.grant.updateMany({
    where: {
      subject_type: 'USER',
      subject_id: String(requester.id),
      resource_type: 'DATASET',
      resource_id: dataset.id,
    },
    data: { revoked_at: new Date() },
  }).catch(() => {});

  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function newDraftRequest(items = [{ access_type_id: viewMetadataTypeId }]) {
  const ar = await arService.createAccessRequest({
    type: 'NEW',
    resource_type: 'DATASET',
    resource_id: dataset.id,
    items,
  }, requester.id);
  arIds.push(ar.id);
  return ar;
}

async function revokeOutstandingGrants() {
  await prisma.grant.updateMany({
    where: {
      subject_type: 'USER',
      subject_id: String(requester.id),
      resource_type: 'DATASET',
      resource_id: dataset.id,
      revoked_at: null,
    },
    data: { revoked_at: new Date() },
  }).catch(() => {});
  // Also close open UNDER_REVIEW requests
  await prisma.access_request.updateMany({
    where: {
      requester_id: requester.id,
      resource_type: 'DATASET',
      resource_id: dataset.id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
    },
    data: { status: 'WITHDRAWN', closed_at: new Date() },
  }).catch(() => {});
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('access requests – concurrency', () => {
  afterEach(async () => {
    await revokeOutstandingGrants();
  });

  describe('concurrent submit of the same DRAFT request', () => {
    it('exactly 1 succeeds; the other receives 409', async () => {
      const ar = await newDraftRequest();

      const [r1, r2] = await Promise.allSettled([
        arService.submitRequest(ar.id, requester.id),
        arService.submitRequest(ar.id, requester.id),
      ]);

      const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failed = [r1, r2].filter((r) => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toMatchObject({ status: 409 });

      // Request must be UNDER_REVIEW — exactly one transition
      const final = await arService.getRequestById(ar.id);
      expect(final.status).toBe('UNDER_REVIEW');

      // Withdraw to return to clean state
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.id });
    });
  });

  describe('concurrent review of the same UNDER_REVIEW request', () => {
    it('exactly 1 review succeeds; the other receives 409', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      const [r1, r2] = await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
      ]);

      const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failed = [r1, r2].filter((r) => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toMatchObject({ status: 409 });

      const final = await arService.getRequestById(submitted.id);
      expect(final.status).toBe('REJECTED');
    });

    it('exactly 1 approval succeeds — 1 grant created, not 2', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'APPROVED',
      }));

      await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
      ]);

      const grantCount = await prisma.grant.count({
        where: {
          subject_type: 'USER',
          subject_id: String(requester.id),
          resource_type: 'DATASET',
          resource_id: dataset.id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(grantCount).toBe(1);
    });
  });

  describe('review vs withdraw race', () => {
    it('exactly one wins — no corrupt intermediate state, closed_at always set', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      const [review, withdraw] = await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.id }),
      ]);

      const successes = [review, withdraw].filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(1);

      const final = await arService.getRequestById(submitted.id);
      expect(['REJECTED', 'WITHDRAWN']).toContain(final.status);
      expect(final.closed_at).not.toBeNull();
    });

    it('if review wins, no grant is created for a rejected item', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: reviewItems },
        }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.id }),
      ]);

      const grantCount = await prisma.grant.count({
        where: {
          subject_type: 'USER',
          subject_id: String(requester.id),
          resource_type: 'DATASET',
          resource_id: dataset.id,
          revoked_at: null,
        },
      });
      expect(grantCount).toBe(0);
    });
  });

  describe('concurrent withdraw attempts', () => {
    it('exactly 1 succeeds from DRAFT; the other receives 409', async () => {
      const ar = await newDraftRequest();

      const [r1, r2] = await Promise.allSettled([
        arService.withdrawRequest({ request_id: ar.id, requester_id: requester.id }),
        arService.withdrawRequest({ request_id: ar.id, requester_id: requester.id }),
      ]);

      const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failed = [r1, r2].filter((r) => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toMatchObject({ status: 409 });

      const final = await arService.getRequestById(ar.id);
      expect(final.status).toBe('WITHDRAWN');
    });

    it('exactly 1 succeeds from UNDER_REVIEW; the other receives 409', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const [r1, r2] = await Promise.allSettled([
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.id }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.id }),
      ]);

      const failed = [r1, r2].filter((r) => r.status === 'rejected');
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toMatchObject({ status: 409 });

      const final = await arService.getRequestById(submitted.id);
      expect(final.status).toBe('WITHDRAWN');
    });
  });

  describe('sequential duplicate submit for same resource + access type', () => {
    it('second submitRequest throws 409 because first is still UNDER_REVIEW', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.id);

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);

      await expect(
        arService.submitRequest(ar2.id, requester.id),
      ).rejects.toMatchObject({ status: 409 });

      // Withdraw ar1 to unblock
      await arService.withdrawRequest({ request_id: ar1.id, requester_id: requester.id });
    });

    it('after first request is withdrawn, second request can be submitted', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.id);
      await arService.withdrawRequest({ request_id: ar1.id, requester_id: requester.id });

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar2.id, requester.id);
      expect(submitted.status).toBe('UNDER_REVIEW');

      await arService.withdrawRequest({ request_id: ar2.id, requester_id: requester.id });
    });
  });
});
