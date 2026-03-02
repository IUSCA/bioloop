/**
 * access-request.invariants.test.js
 *
 * Tests DB-level and service-level invariants for access requests:
 *  - Active grant blocks re-submit (_assertNoActiveGrants)
 *  - Revoking grant unblocks submit
 *  - In-flight request blocks duplicate submit (_assertNoInFlightRequests)
 *  - Review decisions must cover all items exactly (_validateReviewItems)
 *  - Items are immutable once UNDER_REVIEW (updateAccessRequest after submit → 409)
 *  - closed_at is set on every terminal transition
 *  - submitted_at is null for DRAFT, populated after submit
 *  - DB unique constraint on (access_request_id, access_type_id)
 *  - Grant created via review carries creation_type = ACCESS_REQUEST
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const arService = require('@/services/access_requests');
const grantsService = require('@/services/grants');
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
  requester = await createTestUser('_ari_req');
  reviewer = await createTestUser('_ari_rev');
  userIds.push(requester.id, reviewer.id);

  ownerGroup = await createTestGroup(reviewer.id, '_ari_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_ari_ds');
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

async function submitAndReject(items) {
  const ar = await newDraftRequest(items);
  const submitted = await arService.submitRequest(ar.id, requester.id);
  await arService.submitReview({
    request_id: submitted.id,
    reviewer_id: reviewer.id,
    options: {
      review_items: submitted.access_request_items.map((i) => ({
        id: i.id,
        access_type_id: i.access_type_id,
        decision: 'REJECTED',
      })),
    },
  });
  return ar;
}

async function revokeAllRequesterGrants() {
  await prisma.grant.updateMany({
    where: {
      subject_type: 'USER',
      subject_id: String(requester.id),
      resource_type: 'DATASET',
      resource_id: dataset.id,
      revoked_at: null,
    },
    data: { revoked_at: new Date() },
  });
}

async function withdrawOpen() {
  await prisma.access_request.updateMany({
    where: {
      requester_id: requester.id,
      resource_type: 'DATASET',
      resource_id: dataset.id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
    },
    data: { status: 'WITHDRAWN', closed_at: new Date() },
  });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('access requests – invariants', () => {
  afterEach(async () => {
    await revokeAllRequesterGrants();
    await withdrawOpen();
  });

  describe('_assertNoActiveGrants invariant', () => {
    it('submitRequest throws 409 when requester already holds an active grant for that access type', async () => {
      // Create a direct USER grant for the requester first
      await grantsService.createGrant({
        subject_type: 'USER',
        subject_id: String(requester.id),
        resource_type: 'DATASET',
        resource_id: dataset.id,
        access_type_id: viewMetadataTypeId,
      }, reviewer.id);

      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await expect(
        arService.submitRequest(ar.id, requester.id),
      ).rejects.toMatchObject({ status: 409 });

      // Request remains DRAFT
      const final = await arService.getRequestById(ar.id);
      expect(final.status).toBe('DRAFT');
    });

    it('after grant is revoked, submitRequest succeeds', async () => {
      const grant = await grantsService.createGrant({
        subject_type: 'USER',
        subject_id: String(requester.id),
        resource_type: 'DATASET',
        resource_id: dataset.id,
        access_type_id: viewMetadataTypeId,
      }, reviewer.id);

      await grantsService.revokeGrant(grant.id, reviewer.id);

      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.id);
      expect(submitted.status).toBe('UNDER_REVIEW');
    });
  });

  describe('_assertNoInFlightRequests invariant', () => {
    it('submitRequest throws 409 when another UNDER_REVIEW request covers the same access type', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.id);

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await expect(
        arService.submitRequest(ar2.id, requester.id),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('requests for different access types on the same resource can both be submitted', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.id);

      const ar2 = await newDraftRequest([{ access_type_id: downloadTypeId }]);
      const submitted = await arService.submitRequest(ar2.id, requester.id);
      expect(submitted.status).toBe('UNDER_REVIEW');
    });
  });

  describe('review item validation invariant (_validateReviewItems)', () => {
    it('throws 409 when review_items is missing some request items', async () => {
      const ar = await newDraftRequest([
        { access_type_id: viewMetadataTypeId },
        { access_type_id: downloadTypeId },
      ]);
      const submitted = await arService.submitRequest(ar.id, requester.id);

      // Only include one of the two items
      const partialItems = [submitted.access_request_items[0]].map((i) => ({
        id: i.id,
        access_type_id: i.access_type_id,
        decision: 'REJECTED',
      }));

      await expect(
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: { review_items: partialItems },
        }),
      ).rejects.toMatchObject({ status: 409 });

      // Request must remain UNDER_REVIEW
      const final = await arService.getRequestById(submitted.id);
      expect(final.status).toBe('UNDER_REVIEW');
    });

    it('throws 409 when review_items includes items not in the request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.id);

      const foreignItem = {
        id: -1, // Non-existent item ID
        access_type_id: downloadTypeId,
        decision: 'REJECTED',
      };

      await expect(
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.id,
          options: {
            review_items: [
              ...submitted.access_request_items.map((i) => ({
                id: i.id,
                access_type_id: i.access_type_id,
                decision: 'REJECTED',
              })),
              foreignItem,
            ],
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('item immutability once UNDER_REVIEW', () => {
    it('updateAccessRequest after submitRequest throws 409 (status no longer DRAFT)', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.id);

      await expect(
        arService.updateAccessRequest(ar.id, requester.id, {
          items: [{ access_type_id: downloadTypeId }],
        }),
      ).rejects.toMatchObject({ status: 409 });

      // Items unchanged
      const final = await arService.getRequestById(ar.id);
      expect(final.access_request_items).toHaveLength(1);
      expect(final.access_request_items[0].access_type_id).toBe(viewMetadataTypeId);
    });
  });

  describe('closed_at set on every terminal transition', () => {
    it('is set when APPROVED', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.id,
        options: {
          review_items: submitted.access_request_items.map((i) => ({
            id: i.id, access_type_id: i.access_type_id, decision: 'APPROVED',
          })),
        },
      });
      expect(reviewed.status).toBe('APPROVED');
      expect(reviewed.closed_at).not.toBeNull();
    });

    it('is set when REJECTED', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.id,
        options: {
          review_items: submitted.access_request_items.map((i) => ({
            id: i.id, access_type_id: i.access_type_id, decision: 'REJECTED',
          })),
        },
      });
      expect(reviewed.closed_at).not.toBeNull();
    });

    it('is set when WITHDRAWN from DRAFT', async () => {
      const ar = await newDraftRequest();
      const withdrawn = await arService.withdrawRequest({
        request_id: ar.id, requester_id: requester.id,
      });
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('is set when WITHDRAWN from UNDER_REVIEW', async () => {
      const ar = await newDraftRequest();
      await arService.submitRequest(ar.id, requester.id);
      const withdrawn = await arService.withdrawRequest({
        request_id: ar.id, requester_id: requester.id,
      });
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('is set when EXPIRED', async () => {
      const ar = await newDraftRequest();
      await arService.submitRequest(ar.id, requester.id);
      await prisma.access_request.update({
        where: { id: ar.id },
        data: { submitted_at: new Date(0) },
      });
      await arService.expireStaleRequests({ max_age_days: 0 });

      const final = await arService.getRequestById(ar.id);
      expect(final.status).toBe('EXPIRED');
      expect(final.closed_at).not.toBeNull();
    });
  });

  describe('submitted_at invariant', () => {
    it('is null while request is in DRAFT', async () => {
      const ar = await newDraftRequest();
      expect(ar.submitted_at).toBeNull();
    });

    it('is populated after submitRequest', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.id);
      expect(submitted.submitted_at).not.toBeNull();
    });
  });

  describe('DB unique constraint on (access_request_id, access_type_id)', () => {
    it('raw createMany with duplicate access_type_id in same request throws', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);

      await expect(
        prisma.access_request_item.create({
          data: {
            access_request_id: ar.id,
            access_type_id: viewMetadataTypeId,
            decision: 'PENDING',
          },
        }),
      ).rejects.toThrow(); // Prisma P2002 unique constraint
    });
  });

  describe('grant invariant after approval', () => {
    it('approved grant has creation_type = ACCESS_REQUEST', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.id,
        options: {
          review_items: submitted.access_request_items.map((i) => ({
            id: i.id, access_type_id: i.access_type_id, decision: 'APPROVED',
          })),
        },
      });

      const grant = await prisma.grant.findFirst({
        where: {
          subject_type: 'USER',
          subject_id: String(requester.id),
          resource_type: 'DATASET',
          resource_id: dataset.id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(grant).not.toBeNull();
      expect(grant.creation_type).toBe('ACCESS_REQUEST');
    });

    it('access_request_item.created_grant_id is populated for approved item', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.id,
        options: {
          review_items: submitted.access_request_items.map((i) => ({
            id: i.id, access_type_id: i.access_type_id, decision: 'APPROVED',
          })),
        },
      });

      // Fetch item directly
      const item = await prisma.access_request_item.findFirst({
        where: { access_request_id: reviewed.id },
      });
      expect(item.created_grant_id).not.toBeNull();
      expect(item.decision).toBe('APPROVED');
    });
  });
});
