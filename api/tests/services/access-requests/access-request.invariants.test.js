/**
 * access-request.invariants.test.js
 *
 * Tests DB-level and service-level invariants for access requests:
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

  ownerGroup = await createTestGroup(reviewer.subject_id, '_ari_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_ari_ds');
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

async function revokeAllRequesterGrants() {
  await prisma.grant.updateMany({
    where: {
      subject_id: requester.subject_id,
      resource_id: dataset.resource_id,
      revoked_at: null,
    },
    data: { revoked_at: new Date() },
  });
}

async function withdrawOpen() {
  await prisma.access_request.updateMany({
    where: {
      requester_id: requester.subject_id,
      resource_id: dataset.resource_id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
    },
    data: { status: 'WITHDRAWN', closed_at: new Date() },
  });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('access requests - invariants', () => {
  afterEach(async () => {
    await revokeAllRequesterGrants();
    await withdrawOpen();
  });

  describe('createAccessRequest subject validation', () => {
    it('allows self-request when subject_id equals requester_id', async () => {
      const ar = await arService.createAccessRequest({
        type: 'NEW',
        resource_id: dataset.resource_id,
        subject_id: requester.subject_id,
        items: [{ access_type_id: viewMetadataTypeId }],
      }, requester.subject_id);
      arIds.push(ar.id);

      expect(ar.subject_id).toBe(requester.subject_id);
      expect(ar.requester_id).toBe(requester.subject_id);
      expect(ar.status).toBe('DRAFT');
    });

    it('allows group request when requester is admin of the group', async () => {
      const requestGroup = await createTestGroup(requester.subject_id, '_ari_group_request');
      groupIds.push(requestGroup.id);
      await prisma.group_user.create({
        data: { group_id: requestGroup.id, user_id: requester.subject_id, role: 'ADMIN' },
      });

      const ar = await arService.createAccessRequest({
        type: 'NEW',
        resource_id: dataset.resource_id,
        subject_id: requestGroup.id,
        items: [{ access_type_id: viewMetadataTypeId }],
      }, requester.subject_id);
      arIds.push(ar.id);

      expect(ar.subject_id).toBe(requestGroup.id);
      expect(ar.requester_id).toBe(requester.subject_id);
      expect(ar.status).toBe('DRAFT');
    });

    it('rejects request on behalf of another user', async () => {
      const otherUser = await createTestUser('_ari_other_user');
      userIds.push(otherUser.id);

      await expect(arService.createAccessRequest({
        type: 'NEW',
        resource_id: dataset.resource_id,
        subject_id: otherUser.subject_id,
        items: [{ access_type_id: viewMetadataTypeId }],
      }, requester.subject_id)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('_assertNoInFlightRequests invariant', () => {
    it('submitRequest throws 409 when another UNDER_REVIEW request covers the same access type', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.subject_id);

      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await expect(
        arService.submitRequest(ar2.id, requester.subject_id),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('requests for different access types on the same resource can both be submitted', async () => {
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar1.id, requester.subject_id);

      const ar2 = await newDraftRequest([{ access_type_id: downloadTypeId }]);
      const submitted = await arService.submitRequest(ar2.id, requester.subject_id);
      expect(submitted.status).toBe('UNDER_REVIEW');
    });
  });

  describe('review item validation invariant (_validateReviewItems)', () => {
    it('throws 409 when review_items is missing some request items', async () => {
      const ar = await newDraftRequest([
        { access_type_id: viewMetadataTypeId },
        { access_type_id: downloadTypeId },
      ]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      // Only include one of the two items
      const partialItems = [submitted.access_request_items[0]].map((i) => ({
        id: i.id,
        access_type_id: i.access_type_id,
        decision: 'REJECTED',
      }));

      await expect(
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: { item_decisions: partialItems, decision_reason: 'Test' },
        }),
      ).rejects.toMatchObject({ status: 409 });

      // Request must remain UNDER_REVIEW
      const final = await arService.getRequestById(submitted.id);
      expect(final.status).toBe('UNDER_REVIEW');
    });

    it('throws 409 when review_items includes items not in the request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const foreignItem = {
        id: -1, // Non-existent item ID
        access_type_id: downloadTypeId,
        decision: 'REJECTED',
      };

      await expect(
        arService.submitReview({
          request_id: submitted.id,
          reviewer_id: reviewer.subject_id,
          options: {
            item_decisions: [
              ...submitted.access_request_items.map((i) => ({
                id: i.id,
                decision: 'REJECTED',
              })),
              foreignItem,
            ],
            decision_reason: 'Test',
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('item immutability once UNDER_REVIEW', () => {
    it('updateAccessRequest after submitRequest throws 409 (status no longer DRAFT)', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);

      await expect(
        arService.updateAccessRequest(ar.id, requester.subject_id, {
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: submitted.access_request_items.map((i) => ({
            id: i.id, decision: 'APPROVED', approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
        },
      });
      expect(reviewed.status).toBe('APPROVED');
      expect(reviewed.closed_at).not.toBeNull();
    });

    it('is set when REJECTED', async () => {
      const ar = await newDraftRequest();
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: submitted.access_request_items.map((i) => ({
            id: i.id, decision: 'REJECTED',
          })),
          decision_reason: 'Test',
        },
      });
      expect(reviewed.closed_at).not.toBeNull();
    });

    it('is set when WITHDRAWN from DRAFT', async () => {
      const ar = await newDraftRequest();
      const withdrawn = await arService.withdrawRequest({
        request_id: ar.id, requester_id: requester.subject_id,
      });
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('is set when WITHDRAWN from UNDER_REVIEW', async () => {
      const ar = await newDraftRequest();
      await arService.submitRequest(ar.id, requester.subject_id);
      const withdrawn = await arService.withdrawRequest({
        request_id: ar.id, requester_id: requester.subject_id,
      });
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('is set when EXPIRED', async () => {
      const ar = await newDraftRequest();
      await arService.submitRequest(ar.id, requester.subject_id);
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
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
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: submitted.access_request_items.map((i) => ({
            id: i.id, decision: 'APPROVED', approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
        },
      });

      const grant = await prisma.grant.findFirst({
        where: {
          subject_id: requester.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(grant).not.toBeNull();
      expect(grant.creation_type).toBe('ACCESS_REQUEST');
    });

    it('access_request_item.created_grant_id is populated for approved item', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: submitted.access_request_items.map((i) => ({
            id: i.id, decision: 'APPROVED', approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
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

  describe('subject_id invariant', () => {
    let testGroup;

    beforeAll(async () => {
      testGroup = await createTestGroup(requester.subject_id, '_ari_test_grp');
      groupIds.push(testGroup.id);

      // Add requester as ADMIN to testGroup
      await prisma.group_user.create({
        data: {
          group_id: testGroup.id,
          user_id: requester.subject_id,
          role: 'ADMIN',
        },
      });
    });

    afterEach(async () => {
      await prisma.grant.updateMany({
        where: { resource_id: dataset.resource_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    });

    it('stores subject_id correctly for self-request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], requester.subject_id);
      expect(ar.subject_id).toBe(requester.subject_id);
    });

    it('stores subject_id correctly for group request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);
      expect(ar.subject_id).toBe(testGroup.id);
    });

    it('grant is created with subject_id from the request (not requester_id)', async () => {
      // Create a group-targeted request
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      // Approve it
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: submitted.access_request_items.map((i) => ({
            id: i.id, decision: 'APPROVED', approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
        },
      });

      // Grant must have subject_id == testGroup, not requester
      const grant = await prisma.grant.findFirst({
        where: {
          subject_id: testGroup.id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(grant).not.toBeNull();
      expect(grant.subject_id).toBe(testGroup.id);

      // No grant should exist for requester directly
      const requesterGrant = await prisma.grant.findFirst({
        where: {
          subject_id: requester.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(requesterGrant).toBeNull();
    });

    it('_assertNoInFlightRequests checks subject_id, not requester_id', async () => {
      // Create and submit a request for testGroup
      const ar1 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);
      const submitted1 = await arService.submitRequest(ar1.id, requester.subject_id);

      // Try to create and submit another request for testGroup (same resource, same access type)
      const ar2 = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], testGroup.id);
      // Second submit should fail because ar1 is already UNDER_REVIEW
      await expect(
        arService.submitRequest(ar2.id, requester.subject_id),
      ).rejects.toMatchObject({ status: 409 });

      // Cleanup
      await arService.withdrawRequest({ request_id: submitted1.id, requester_id: requester.subject_id });
    });
  });
});
