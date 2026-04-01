/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * access-request.lifecycle.test.js
 *
 * Tests the full lifecycle of an access request:
 *   DRAFT → (update) → UNDER_REVIEW → APPROVED / PARTIALLY_APPROVED / REJECTED → grants
 *   DRAFT → WITHDRAWN
 *   UNDER_REVIEW → WITHDRAWN
 *   UNDER_REVIEW → EXPIRED  (via expireStaleRequests)
 * Also tests query functions: getRequestsByUser, getRequestsPendingReviewForUser,
 * getRequestsReviewedByUser.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const arService = require('@/services/access_requests');
const grantsService = require('@/services/grants');
const Expiry = require('@/utils/expiry');
const { TARGET_TYPE, AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestCollection,
  getAccessTypeId,
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteCollection,
  deleteGrantsForResource,
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
const collectionIds = [];
// access_request IDs created in each test — tracked to ensure cleanup
const arIds = [];

beforeAll(async () => {
  requester = await createTestUser('_ar_req');
  reviewer = await createTestUser('_ar_rev');
  userIds.push(requester.id, reviewer.id);

  // reviewer is ADMIN of ownerGroup so getRequestsPendingReviewForUser returns results
  ownerGroup = await createTestGroup(reviewer.subject_id, '_ar_og');
  groupIds.push(ownerGroup.id);

  // add reviewer as ADMIN of ownerGroup
  await prisma.group_user.create({
    data: {
      group_id: ownerGroup.id,
      user_id: reviewer.subject_id,
      role: 'ADMIN',
    },
  });
  // deleting group will cascade and delete this membership

  dataset = await createTestDataset(ownerGroup.id, '_ar_ds');
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
  await deleteGrantsForResource(dataset.resource_id).catch(() => {});
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of collectionIds) await deleteCollection(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function newDraftRequest(items, overrides = {}, subjectId = null) {
  const ar = await arService.createAccessRequest({
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: subjectId || requester.subject_id,
    items,
    ...overrides,
  }, requester.subject_id);
  arIds.push(ar.id);
  return ar;
}

function allApproveItems(ar) {
  return ar.access_request_items.map((item) => ({
    id: item.id,
    decision: 'APPROVED',
    approved_expiry: Expiry.at(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)),
  }));
}

function allRejectItems(ar) {
  return ar.access_request_items.map((item) => ({
    id: item.id,
    decision: 'REJECTED',
  }));
}

async function cleanupGrantsForRequester() {
  // Revoke all active USER grants for requester on this dataset so tests don't interfere
  await prisma.grant.updateMany({
    where: {
      subject_id: requester.subject_id,
      resource_id: dataset.resource_id,
      revoked_at: null,
    },
    data: { revoked_at: new Date() },
  });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('access requests - lifecycle', () => {
  describe('createAccessRequest', () => {
    it('creates a DRAFT request with PENDING items and null submitted_at', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      expect(ar.status).toBe('DRAFT');
      expect(ar.submitted_at).toBeNull();
      expect(ar.access_request_items).toHaveLength(1);
      expect(ar.access_request_items[0].decision).toBe('PENDING');
    });

    it('creates a REQUEST_CREATED audit row', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const audit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,
          target_type: TARGET_TYPE.ACCESS_REQUEST,
          target_id: ar.id,
        },
      });
      expect(audit).not.toBeNull();
    });

    it('stores purpose on the request', async () => {
      const ar = await newDraftRequest(
        [{ access_type_id: viewMetadataTypeId }],
        { purpose: 'Testing purposes' },
      );
      expect(ar.purpose).toBe('Testing purposes');
    });

    it('creates a multi-item request with each item PENDING', async () => {
      const ar = await newDraftRequest([
        { access_type_id: viewMetadataTypeId },
        { access_type_id: downloadTypeId },
      ]);
      expect(ar.access_request_items).toHaveLength(2);
      expect(ar.access_request_items.every((i) => i.decision === 'PENDING')).toBe(true);
    });
  });

  describe('updateAccessRequest', () => {
    it('replaces items on a DRAFT request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const updated = await arService.updateAccessRequest(ar.id, requester.subject_id, {
        items: [
          { access_type_id: viewMetadataTypeId },
          { access_type_id: downloadTypeId },
        ],
      });
      expect(updated.access_request_items).toHaveLength(2);
    });

    it('updates purpose on a DRAFT request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const updated = await arService.updateAccessRequest(ar.id, requester.subject_id, {
        purpose: 'Updated purpose',
      });
      expect(updated.purpose).toBe('Updated purpose');
    });

    it('throws 409 when request is not in DRAFT status', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);
      await expect(
        arService.updateAccessRequest(ar.id, requester.subject_id, { purpose: 'Should fail' }),
      ).rejects.toMatchObject({ status: 409 });
      // withdraw to clean up
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });
  });

  describe('submitRequest', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('transitions DRAFT → UNDER_REVIEW and sets submitted_at', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      expect(submitted.status).toBe('UNDER_REVIEW');
      expect(submitted.submitted_at).not.toBeNull();
      // withdraw to clean up
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });

    it('creates a REQUEST_SUBMITTED audit row with subject/resource metadata', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const audit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.REQUEST_SUBMITTED,
          target_type: TARGET_TYPE.ACCESS_REQUEST,
          target_id: submitted.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit.subject_id).toBe(requester.subject_id);
      expect(audit.subject_type).toBe('USER');
      expect(audit.resource_id).toBe(dataset.resource_id);
      expect(audit.resource_type).toBe('DATASET');
      expect(audit.resource_name).toBe(dataset.name);
      // withdraw to clean up
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });

    it('throws 409 if called again on an already UNDER_REVIEW request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);
      await expect(
        arService.submitRequest(ar.id, requester.subject_id),
      ).rejects.toMatchObject({ status: 409 });
      // withdraw to clean up
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });
  });

  describe('submitReview - APPROVED', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('transitions UNDER_REVIEW → APPROVED and creates a grant', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allApproveItems(submitted), decision_reason: 'Test' },
      });

      expect(reviewed.status).toBe('APPROVED');
      expect(reviewed.closed_at).not.toBeNull();
      expect(reviewed.reviewed_by).toBe(reviewer.subject_id);

      // Grant must exist for requester
      const hasGrant = await grantsService.userHasGrant({
        user_id: requester.subject_id,
        resource_id: dataset.resource_id,
        access_type_id: viewMetadataTypeId,
      });
      expect(hasGrant).toBe(true);
    });

    it('grant carries creation_type = ACCESS_REQUEST', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allApproveItems(submitted), decision_reason: 'Test' },
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

    it('stores decision_reason when provided', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: {
          item_decisions: allApproveItems(submitted),
          decision_reason: 'Looks good',
        },
      });
      expect(reviewed.decision_reason).toBe('Looks good');
    });
  });

  describe('submitReview - REJECTED', () => {
    it('transitions UNDER_REVIEW → REJECTED, no grant created', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allRejectItems(submitted), decision_reason: 'Test' },
      });

      expect(reviewed.status).toBe('REJECTED');
      expect(reviewed.closed_at).not.toBeNull();

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

  describe('submitReview - PARTIALLY_APPROVED', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('transitions UNDER_REVIEW → PARTIALLY_APPROVED when some items approved', async () => {
      const ar = await newDraftRequest([
        { access_type_id: viewMetadataTypeId },
        { access_type_id: downloadTypeId },
      ]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const mixedItems = submitted.access_request_items.map((item, idx) => ({
        id: item.id,
        decision: idx === 0 ? 'APPROVED' : 'REJECTED',
        ...(idx === 0 && { approved_expiry: Expiry.at(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)) }),
      }));

      const reviewed = await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: mixedItems, decision_reason: 'Test' },
      });

      expect(reviewed.status).toBe('PARTIALLY_APPROVED');
    });
  });

  describe('withdrawRequest', () => {
    it('transitions DRAFT → WITHDRAWN and sets closed_at', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const withdrawn = await arService.withdrawRequest({
        request_id: ar.id,
        requester_id: requester.subject_id,
      });
      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('transitions UNDER_REVIEW → WITHDRAWN and sets closed_at', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      const withdrawn = await arService.withdrawRequest({
        request_id: submitted.id,
        requester_id: requester.subject_id,
      });
      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.closed_at).not.toBeNull();
    });

    it('throws 409 when request is already terminal (WITHDRAWN)', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
      await expect(
        arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('expireStaleRequests', () => {
    it('marks UNDER_REVIEW requests older than max_age_days as EXPIRED', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);

      // Backdate submitted_at to make it appear stale
      await prisma.access_request.update({
        where: { id: ar.id },
        data: { submitted_at: new Date(0) }, // epoch = very old
      });

      const count = await arService.expireStaleRequests({ max_age_days: 0 });
      expect(count).toBeGreaterThanOrEqual(1);

      const updated = await arService.getRequestById(ar.id);
      expect(updated.status).toBe('EXPIRED');
      expect(updated.closed_at).not.toBeNull();
    });

    it('does not expire requests newer than max_age_days', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);

      // maxAge=30 days; request was just submitted — should not expire
      await arService.expireStaleRequests({ max_age_days: 30 });

      const updated = await arService.getRequestById(ar.id);
      expect(updated.status).toBe('UNDER_REVIEW');

      // Clean up: withdraw so we don't interfere with other tests
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });
  });

  describe('getRequestsByUser', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('returns requests for the requester with pagination metadata', async () => {
      await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);

      const result = await arService.getRequestsByUser({
        requester_id: requester.subject_id,
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(result.metadata.total).toBeGreaterThanOrEqual(2);
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      expect(result.data.every(
        (r) => r.requester_id === requester.subject_id || r.requester_id === requester.subject_id,
      )).toBe(true);
    });

    it('filters by status', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      await arService.submitRequest(ar.id, requester.subject_id);

      const result = await arService.getRequestsByUser({
        requester_id: requester.subject_id,
        status: 'UNDER_REVIEW',
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(result.data.every((r) => r.status === 'UNDER_REVIEW')).toBe(true);
      // Withdraw to clean up
      await arService.withdrawRequest({ request_id: ar.id, requester_id: requester.subject_id });
    });

    it('filters by resource_id and resource_type', async () => {
      const collection = await createTestCollection(ownerGroup.id, requester.subject_id, '_ar_ct');
      collectionIds.push(collection.id);
      const collectionViewTypeId = await getAccessTypeId('COLLECTION:VIEW_METADATA');

      const collectionRequest = await newDraftRequest(
        [{ access_type_id: collectionViewTypeId }],
        { resource_id: collection.id },
      );

      const resourceIdResult = await arService.getRequestsByUser({
        requester_id: requester.subject_id,
        resource_id: collection.id,
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(resourceIdResult.data.every((r) => r.resource_id === collection.id)).toBe(true);

      const resourceTypeResult = await arService.getRequestsByUser({
        requester_id: requester.subject_id,
        resource_type: 'COLLECTION',
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(resourceTypeResult.data.every((r) => r.resource.type === 'COLLECTION')).toBe(true);

      // Withdraw to clean up
      await arService.withdrawRequest({ request_id: collectionRequest.id, requester_id: requester.subject_id });
    });
  });

  describe('getRequestsPendingReviewForUser', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('returns UNDER_REVIEW requests for datasets the reviewer administers', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const result = await arService.getRequestsPendingReviewForUser({
        reviewer_id: reviewer.subject_id,
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(submitted.id);

      await arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id });
    });

    it('filters by resource_type for pending review requests', async () => {
      const collection = await createTestCollection(ownerGroup.id, requester.subject_id, '_ar_ct');
      collectionIds.push(collection.id);
      const collectionViewTypeId = await getAccessTypeId('COLLECTION:VIEW_METADATA');

      const ar = await newDraftRequest(
        [{ access_type_id: collectionViewTypeId }],
        { resource_id: collection.id },
      );
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);

      const result = await arService.getRequestsPendingReviewForUser({
        reviewer_id: reviewer.subject_id,
        resource_type: 'COLLECTION',
        sort_by: 'created_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(result.data.every((r) => r.resource.type === 'COLLECTION')).toBe(true);

      await arService.withdrawRequest({ request_id: submitted.id, requester_id: requester.subject_id });
    });
  });

  describe('getRequestsReviewedByUser', () => {
    afterEach(async () => {
      await cleanupGrantsForRequester();
    });

    it('returns requests reviewed by the reviewer', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }]);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allRejectItems(submitted), decision_reason: 'Test' },
      });

      const result = await arService.getRequestsReviewedByUser({
        user_id: reviewer.subject_id,
        sort_by: 'reviewed_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(submitted.id);
    });

    it('filters reviewed requests by resource_type', async () => {
      const collection = await createTestCollection(ownerGroup.id, requester.subject_id, '_ar_ct');
      collectionIds.push(collection.id);
      const collectionViewTypeId = await getAccessTypeId('COLLECTION:VIEW_METADATA');

      const ar = await newDraftRequest(
        [{ access_type_id: collectionViewTypeId }],
        { resource_id: collection.id },
      );
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allRejectItems(submitted), decision_reason: 'Test' },
      });

      const result = await arService.getRequestsReviewedByUser({
        user_id: reviewer.subject_id,
        resource_type: 'COLLECTION',
        sort_by: 'reviewed_at',
        sort_order: 'desc',
        offset: 0,
        limit: 100,
      });

      expect(result.data.every((r) => r.resource.type === 'COLLECTION')).toBe(true);
    });
  });

  describe('subject_id - self-request', () => {
    it('creates a request with subject_id = requester_id for self-request', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], {}, requester.subject_id);
      expect(ar.subject_id).toBe(requester.subject_id);
    });

    it('grant is created for the subject (requester) when request is approved', async () => {
      const ar = await newDraftRequest([{ access_type_id: viewMetadataTypeId }], {}, requester.subject_id);
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allApproveItems(submitted), decision_reason: 'Test' },
      });

      // Grant should exist with subject_id == requester
      const grant = await prisma.grant.findFirst({
        where: {
          subject_id: requester.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetadataTypeId,
          revoked_at: null,
        },
      });
      expect(grant).not.toBeNull();
      expect(grant.subject_id).toBe(requester.subject_id);
    });
  });

  describe('subject_id - group request', () => {
    let testGroup;
    let groupMember;

    beforeAll(async () => {
      // Create a test group for group-based requests
      testGroup = await createTestGroup(reviewer.subject_id, '_ar_test_group');
      groupIds.push(testGroup.id);

      // Create a member for the group
      groupMember = await createTestUser('_ar_group_member');
      userIds.push(groupMember.id);

      // Add requester as ADMIN to testGroup
      await prisma.group_user.create({
        data: {
          group_id: testGroup.id,
          user_id: requester.subject_id,
          role: 'ADMIN',
        },
      });

      // Add groupMember as MEMBER to testGroup
      await prisma.group_user.create({
        data: {
          group_id: testGroup.id,
          user_id: groupMember.subject_id,
          role: 'MEMBER',
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

    it('creates a request with subject_id = group.id for group request', async () => {
      const ar = await newDraftRequest(
        [{ access_type_id: viewMetadataTypeId }],
        {},
        testGroup.id,
      );
      expect(ar.subject_id).toBe(testGroup.id);
    });

    it('grant is created for the subject (group) when request is approved', async () => {
      const ar = await newDraftRequest(
        [{ access_type_id: viewMetadataTypeId }],
        {},
        testGroup.id,
      );
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allApproveItems(submitted), decision_reason: 'Test' },
      });

      // Grant should exist with subject_id == group
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
    });

    it('group members inherit access from group grant', async () => {
      const ar = await newDraftRequest(
        [{ access_type_id: viewMetadataTypeId }],
        {},
        testGroup.id,
      );
      const submitted = await arService.submitRequest(ar.id, requester.subject_id);
      await arService.submitReview({
        request_id: submitted.id,
        reviewer_id: reviewer.subject_id,
        options: { item_decisions: allApproveItems(submitted), decision_reason: 'Test' },
      });

      // groupMember should have access via group membership
      const hasAccess = await grantsService.userHasGrant({
        user_id: groupMember.subject_id,
        resource_id: dataset.resource_id,
        access_type_id: viewMetadataTypeId,
      });
      expect(hasAccess).toBe(true);
    });
  });
});
