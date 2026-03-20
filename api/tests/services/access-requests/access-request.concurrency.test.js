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
// eslint-disable-next-line no-unused-vars
let downloadTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];
const arIds = [];

beforeAll(async () => {
  requester = await createTestUser('_arc_req');
  reviewer = await createTestUser('_arc_rev');
  userIds.push(requester.id, reviewer.id);

  ownerGroup = await createTestGroup(reviewer.subject_id, '_arc_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_arc_ds');
  datasetIds.push(dataset.id);

  [viewMetadataTypeId, downloadTypeId] = await Promise.all([
    getAccessTypeId('DATASET:VIEW_METADATA'),
    getAccessTypeId('DATASET:DOWNLOAD'),
  ]);
}, 30_000);

afterAll(async () => {
  for (const id of arIds) {
    await prisma.access_request.deleteMany({ where: { id } }).catch(() => {});
  }
  // Revoke all grants created during tests
  await prisma.grant.updateMany({
    where: {
      subject_id: requester.subject_id,
      resource_id: dataset.resource_id,
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

async function newDraftRequest(items = [{ access_type_id: viewMetadataTypeId }], subjectId = null) {
  const ar = await arService.createAccessRequest({
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: subjectId || requester.subject_id,
    items,
  }, requester.subject_id);
  arIds.push(ar.id);
  return ar;
}

async function revokeOutstandingGrants() {
  await prisma.grant.updateMany({
    where: {
      subject_id: requester.subject_id,
      resource_id: dataset.resource_id,
      revoked_at: null,
    },
    data: { revoked_at: new Date() },
  }).catch(() => {});
  // Also close open UNDER_REVIEW requests
  await prisma.access_request.updateMany({
    where: {
      requester_id: requester.subject_id,
      resource_id: dataset.resource_id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
    },
    data: { status: 'WITHDRAWN', closed_at: new Date() },
  }).catch(() => {});
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('access requests - concurrency', () => {
  afterEach(async () => {
    await revokeOutstandingGrants();
  });

  describe('concurrent submit of the same DRAFT request', () => {
    it('exactly 1 succeeds; the other receives 409', async () => {
      const ar = await newDraftRequest();

      const [r1, r2] = await Promise.allSettled([
        arService.submitRequest(ar.id, requester.subject_id),
        arService.submitRequest(ar.id, requester.subject_id),
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
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });
  });

  describe('concurrent review of the same UNDER_REVIEW request', () => {
    it('exactly 1 review succeeds; the other receives 409', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      const [r1, r2] = await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { review_items: reviewItems },
        }),
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'APPROVED',
      }));

      await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { review_items: reviewItems },
        }),
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { review_items: reviewItems },
        }),
      ]);

      const grantCount = await prisma.grant.count({
        where: {
          subject_id: requester.subject_id,
          resource_id: dataset.resource_id,
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      const [review, withdraw] = await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { review_items: reviewItems },
        }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id }),
      ]);

      const successes = [review, withdraw].filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(1);

      const final = await arService.getRequestById(submitted.id);
      expect(['REJECTED', 'WITHDRAWN']).toContain(final.status);
      expect(final.closed_at).not.toBeNull();
    });

    it('if review wins, no grant is created for a rejected item', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewItems = submitted.access_request_items.map((item) => ({
        id: item.id,
        access_type_id: item.access_type_id,
        decision: 'REJECTED',
      }));

      await Promise.allSettled([
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { review_items: reviewItems },
        }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id }),
      ]);

      const grantCount = await prisma.grant.count({
        where: {
          subject_id: requester.subject_id,
          resource_id: dataset.resource_id,
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
        arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id }),
        arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id }),
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const [r1, r2] = await Promise.allSettled([
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id }),
        arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id }),
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
      await arService.submitRequest(ar1.id, requester.subject_id);

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);

      await expect(
        arService.submitRequest(ar2.id, requester.subject_id),
      ).rejects.toMatchObject({ status: 409 });

      // Withdraw ar1 to unblock
      await arService.withdrawRequest({ request_id: ar1.id, requester_id: requester.subject_id });
    });

    it('after first request is withdrawn, second request can be submitted', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.subject_id);
      await arService.withdrawRequest({ request_id: ar1.id, requester_id: requester.subject_id });

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar2.id, requester.subject_id);
      expect(submitted.status).toBe('UNDER_REVIEW');

      await arService.withdrawRequest({ request_id: ar2.id, requester_id: requester.subject_id });
    });
  });

  describe('concurrent operations on subject-based (group) requests', () => {
    let testGroup;

    beforeAll(async () => {
      testGroup = await createTestGroup(requester.subject_id, '_arc_grp');
      groupIds.push(testGroup.id);

      await prisma.group_user.create({
        data: {
          group_id: testGroup.id,
          user_id: requester.subject_id,
          role: 'ADMIN',
        },
      });
    });

    afterEach(async () => {
      // Revoke grants created for the group
      await prisma.grant.updateMany({
        where: {
          subject_id: testGroup.id,
          resource_id: dataset.resource_id,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });
    });

    it('concurrent submit on same DRAFT group request — exactly one succeeds', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);

      const results = await Promise.allSettled([
        arService.submitRequest(ar.id, requester.subject_id),
        arService.submitRequest(ar.id, requester.subject_id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.status).toBe(409);

      // Cleanup
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });

    it('concurrent in-flight checks prevent duplicate group requests', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);
      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);

      // Submit ar1
      await arService.submitRequest(ar1.id, requester.subject_id);

      // Try to submit ar2 — should fail because ar1 is still UNDER_REVIEW
      await expect(
        arService.submitRequest(ar2.id, requester.subject_id),
      ).rejects.toMatchObject({ status: 409 });

      // Cleanup
      await arService.withdrawRequest({ request_id: ar1.id, requester_id: requester.subject_id });
    });
  });
});
