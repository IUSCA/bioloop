const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const arService = require('@/services/access_requests');
const { TARGET_TYPE, AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteGrantsForResource,
} = require('../helpers');

let presetActor;
let presetReviewer;
let presetRequester;
let presetDataset;
let presetAccessTypes;
let testPreset;

const userIds = [];
const groupIds = [];
const datasetIds = [];
const arIds = [];

beforeAll(async () => {
  presetActor = await createTestUser('_preset_actor');
  presetReviewer = await createTestUser('_preset_reviewer');
  presetRequester = await createTestUser('_preset_requester');
  userIds.push(presetActor.id, presetReviewer.id, presetRequester.id);

  const group = await createTestGroup(presetActor.subject_id, '_preset_group');
  groupIds.push(group.id);

  await prisma.group_user.create({
    data: {
      group_id: group.id,
      user_id: presetReviewer.subject_id,
      role: 'ADMIN',
    },
  });

  presetDataset = await createTestDataset(group.id, '_preset_dataset');
  datasetIds.push(presetDataset.id);

  presetAccessTypes = await prisma.grant_access_type.findMany({ take: 3 });

  if (presetAccessTypes.length >= 2) {
    testPreset = await prisma.grant_preset.create({
      data: {
        name: `Test Preset Lifecycle ${Date.now()}`,
        slug: `test-preset-lc-${Date.now()}`,
        is_active: true,
        access_type_items: {
          create: [
            { access_type_id: presetAccessTypes[0].id },
            { access_type_id: presetAccessTypes[1].id },
          ],
        },
      },
    });
  }
}, 30_000);

afterAll(async () => {
  for (const id of arIds) {
    await prisma.access_request.deleteMany({ where: { id } }).catch(() => {});
  }
  await deleteGrantsForResource(presetDataset.resource_id).catch(() => {});
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// -----------------------------------------------------------------------------
// Preset-specific tests
// -----------------------------------------------------------------------------

describe('access requests with presets', () => {
  let presetSubject;

  beforeEach(async () => {
    presetSubject = presetRequester;

    try {
      const requests = await prisma.access_request.findMany({
        where: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
        },
        select: { id: true },
      });

      for (const req of requests) {
        await prisma.access_request_item.deleteMany({ where: { access_request_id: req.id } });
        await prisma.grant.deleteMany({ where: { source_access_request_id: req.id } });
      }

      await prisma.access_request.deleteMany({
        where: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
        },
      });
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }

    try {
      await prisma.grant.deleteMany({
        where: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
        },
      });
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
  });

  describe('createAccessRequest with preset_id items', () => {
    it('creates request with preset_id items and hydrates preset data', async () => {
      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Testing preset requests',
          items: [
            {
              preset_id: testPreset.id,
              requested_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          ],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      expect(request).toMatchObject({
        type: 'NEW',
        resource_id: presetDataset.resource_id,
        subject_id: presetSubject.subject_id,
        status: 'DRAFT',
      });

      expect(request.access_request_items).toHaveLength(1);
      const item = request.access_request_items[0];
      expect(item.preset_id).toBe(testPreset.id);
      expect(item.access_type_id).toBeNull();
      expect(item.preset).toBeDefined();
      expect(item.preset.access_type_items).toHaveLength(2);
    });

    it('creates request with mixed access_type_id and preset_id items', async () => {
      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Mixed items request',
          items: [
            { access_type_id: presetAccessTypes[0].id },
            { preset_id: testPreset.id },
          ],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      expect(request.access_request_items).toHaveLength(2);

      const typeItem = request.access_request_items.find((i) => i.access_type_id);
      expect(typeItem).toBeDefined();
      expect(typeItem.preset_id).toBeNull();

      const presetItem = request.access_request_items.find((i) => i.preset_id);
      expect(presetItem).toBeDefined();
      expect(presetItem.access_type_id).toBeNull();
    });
  });

  describe('submitRequest validation with presets', () => {
    it('validates expanded access types for active grants', async () => {
      await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[0].id,
          granted_by: presetActor.subject_id,
          valid_from: new Date(),
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Should fail due to active grant',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      const submitted = await arService.submitRequest(request.id, presetRequester.subject_id);
      expect(submitted.status).toBe('UNDER_REVIEW');
    });

    it('validates expanded access types against in-flight requests', async () => {
      const request1 = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'First request',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );
      arIds.push(request1.id);

      await arService.submitRequest(request1.id, presetRequester.subject_id);

      const request2 = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Second request',
          items: [{ access_type_id: presetAccessTypes[0].id }],
        },
        presetRequester.subject_id,
      );
      arIds.push(request2.id);

      const submitted2 = await arService.submitRequest(request2.id, presetRequester.subject_id);
      expect(submitted2.status).toBe('UNDER_REVIEW');
    });
  });

  describe('submitReview with preset items - expansion and deduplication', () => {
    it('expands preset items to individual grants', async () => {
      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Preset expansion test',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);

      const updatedRequest = await arService.getRequestById(request.id);
      const itemIds = updatedRequest.access_request_items.map((i) => i.id);

      const reviewResult = await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: itemIds.map((id) => ({
            id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
        },
      });

      expect(reviewResult.status).toBe('APPROVED');

      const grants = await prisma.grant.findMany({
        where: {
          source_access_request_id: request.id,
          subject_id: presetSubject.subject_id,
        },
      });

      expect(grants).toHaveLength(2);
      expect(grants.map((g) => g.access_type_id).sort()).toEqual(
        [presetAccessTypes[0].id, presetAccessTypes[1].id].sort(),
      );

      for (const grant of grants) {
        expect(grant.source_access_request_id).toBe(request.id);
      }
    });

    it('deduplicates access types from overlapping preset and direct items', async () => {
      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Deduplication test',
          items: [
            { preset_id: testPreset.id },
            { access_type_id: presetAccessTypes[0].id },
          ],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);

      const updatedRequest = await arService.getRequestById(request.id);
      const itemIds = updatedRequest.access_request_items.map((i) => i.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: itemIds.map((id) => ({
            id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Test',
        },
      });

      const grants = await prisma.grant.findMany({
        where: {
          source_access_request_id: request.id,
          subject_id: presetSubject.subject_id,
        },
      });

      expect(grants.length).toBeLessThanOrEqual(3);

      const accessTypeIds = grants.map((g) => g.access_type_id);
      expect(accessTypeIds.length).toBe(new Set(accessTypeIds).size);
    });

    it('can handle overlapping presets in one request with deduplication', async () => {
      const secondPreset = await prisma.grant_preset.create({
        data: {
          name: `Test Preset Overlap ${Date.now()}`,
          slug: `test-preset-overlap-${Date.now()}`,
          is_active: true,
          access_type_items: {
            create: [
              { access_type_id: presetAccessTypes[1].id },
              { access_type_id: presetAccessTypes[2]?.id || presetAccessTypes[0].id },
            ],
          },
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Overlapping presets test',
          items: [
            { preset_id: testPreset.id },
            { preset_id: secondPreset.id },
          ],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);
      const updatedRequest = await arService.getRequestById(request.id);
      const itemIds = updatedRequest.access_request_items.map((i) => i.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: itemIds.map((id) => ({
            id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Overlap test',
        },
      });

      const grants = await prisma.grant.findMany({
        where: {
          source_access_request_id: request.id,
          subject_id: presetSubject.subject_id,
        },
      });

      const expectedAccessTypeIds = new Set([
        presetAccessTypes[0].id,
        presetAccessTypes[1].id,
        presetAccessTypes[2]?.id || presetAccessTypes[0].id,
      ]);

      expect(new Set(grants.map((g) => g.access_type_id))).toEqual(expectedAccessTypeIds);
    });

    it('supersedes an existing shorter grant when a new request provides longer expirations', async () => {
      const existingGrant = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[0].id,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Supersede test',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);
      const updatedRequest = await arService.getRequestById(request.id);
      const itemIds = updatedRequest.access_request_items.map((i) => i.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: itemIds.map((id) => ({
            id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Supersede test',
        },
      });

      const revokedExisting = await prisma.grant.findUnique({ where: { id: existingGrant.id } });
      expect(revokedExisting.revoked_at).not.toBeNull();
      expect(revokedExisting.revocation_type).toBe('SUPERSEDED');

      const newGrant = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[0].id,
          revoked_at: null,
        },
      });
      expect(newGrant).not.toBeNull();
      expect(newGrant.valid_until > existingGrant.valid_until).toBe(true);

      const auditRecord = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.GRANT_SUPERSEDED,
          target_type: TARGET_TYPE.GRANT,
          target_id: newGrant.id,
        },
      });
      expect(auditRecord).not.toBeNull();
    });

    it('skips grant creation when an existing grant is longer than the requested approval', async () => {
      const existingGrant = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[0].id,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Skip due to longer existing grant',
          items: [{ access_type_id: presetAccessTypes[0].id }],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);
      await arService.submitRequest(request.id, presetRequester.subject_id);

      const updatedRequest = await arService.getRequestById(request.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: updatedRequest.access_request_items.map((item) => ({
            id: item.id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Skip test',
        },
      });

      const newGrant = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[0].id,
        },
      });
      expect(newGrant).toBeNull();

      const stillExisting = await prisma.grant.findUnique({ where: { id: existingGrant.id } });
      expect(stillExisting.revoked_at).toBeNull();

      const skippedAudit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.GRANT_CREATION_SKIPPED,
          target_type: TARGET_TYPE.ACCESS_REQUEST,
          target_id: request.id,
        },
      });
      expect(skippedAudit).not.toBeNull();
      expect(skippedAudit.metadata.existing_grant_id).toBe(existingGrant.id);
    });

    it('skips grant creation for a preset entry when an existing indefinite grant already covers it', async () => {
      const existingIndefinite = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[1].id,
          valid_from: new Date(),
          valid_until: null,
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Skip only preset overlap',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );
      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);

      const updatedRequest = await arService.getRequestById(request.id);
      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: updatedRequest.access_request_items.map((item) => ({
            id: item.id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Skip indefinite test',
        },
      });

      const existingStill = await prisma.grant.findUnique({ where: { id: existingIndefinite.id } });
      expect(existingStill.revoked_at).toBeNull();

      const newExisting = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[1].id,
        },
      });
      expect(newExisting).toBeNull();

      const skipAudit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.GRANT_CREATION_SKIPPED,
          target_type: TARGET_TYPE.ACCESS_REQUEST,
          target_id: request.id,
        },
      });
      expect(skipAudit).not.toBeNull();
      expect(skipAudit.metadata.existing_grant_id).toBe(existingIndefinite.id);
    });

    it('supersedes finite existing grants and skips longer ones in same preset expansion', async () => {
      const existingShort = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[0].id,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const existingLong = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[1].id,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Mixed supersede/skip test',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );
      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);
      const updatedRequest = await arService.getRequestById(request.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: updatedRequest.access_request_items.map((item) => ({
            id: item.id,
            decision: 'APPROVED',
            approved_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })),
          decision_reason: 'Mixed branch test',
        },
      });

      const shortGrant = await prisma.grant.findUnique({ where: { id: existingShort.id } });
      expect(shortGrant.revocation_type).toBe('SUPERSEDED');
      expect(shortGrant.revoked_at).not.toBeNull();

      const replacedShort = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[0].id,
          revoked_at: null,
        },
      });
      expect(replacedShort).not.toBeNull();

      const longGrant = await prisma.grant.findUnique({ where: { id: existingLong.id } });
      expect(longGrant.revoked_at).toBeNull();

      const skippedLong = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.GRANT_CREATION_SKIPPED,
          target_type: TARGET_TYPE.ACCESS_REQUEST,
          target_id: request.id,
        },
      });
      expect(skippedLong).not.toBeNull();
      expect(skippedLong.metadata.existing_grant_id).toBe(existingLong.id);

      const supersededAudit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: AUTH_EVENT_TYPE.GRANT_SUPERSEDED,
          target_type: TARGET_TYPE.GRANT,
        },
      });
      expect(supersededAudit).not.toBeNull();

      const requestNewGrant = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[0].id,
          revoked_at: null,
        },
      });
      expect(requestNewGrant).not.toBeNull();
      expect(requestNewGrant.valid_until > existingShort.valid_until).toBe(true);
    });

    it('supersedes a finite existing grant when request approval is indefinite', async () => {
      const existing = await prisma.grant.create({
        data: {
          subject_id: presetSubject.subject_id,
          resource_id: presetDataset.resource_id,
          access_type_id: presetAccessTypes[0].id,
          valid_from: new Date(),
          valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          granted_by: presetActor.subject_id,
          creation_type: 'MANUAL',
        },
      });

      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Indefinite approval test',
          items: [{ preset_id: testPreset.id }],
        },
        presetRequester.subject_id,
      );
      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);
      const updatedRequest = await arService.getRequestById(request.id);

      await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: updatedRequest.access_request_items.map((item) => ({
            id: item.id,
            decision: 'APPROVED',
            approved_until: null,
          })),
          decision_reason: 'Indefinite test',
        },
      });

      const old = await prisma.grant.findUnique({ where: { id: existing.id } });
      expect(old.revocation_type).toBe('SUPERSEDED');
      expect(old.revoked_at).not.toBeNull();

      const newUnlimited = await prisma.grant.findFirst({
        where: {
          source_access_request_id: request.id,
          access_type_id: presetAccessTypes[0].id,
          revoked_at: null,
        },
      });
      expect(newUnlimited).not.toBeNull();
      expect(newUnlimited.valid_until).toBeNull();
    });
  });

  describe('Partial approval with presets', () => {
    it('supports approving some items and rejecting others with presets', async () => {
      const request = await arService.createAccessRequest(
        {
          type: 'NEW',
          resource_id: presetDataset.resource_id,
          subject_id: presetSubject.subject_id,
          purpose: 'Partial approval test',
          items: [
            { preset_id: testPreset.id },
            { access_type_id: presetAccessTypes[2]?.id || presetAccessTypes[0].id },
          ],
        },
        presetRequester.subject_id,
      );

      arIds.push(request.id);

      await arService.submitRequest(request.id, presetRequester.subject_id);

      const updatedRequest = await arService.getRequestById(request.id);
      const [presetItem, directItem] = updatedRequest.access_request_items.sort(
        () => 0,
      );

      const reviewResult = await arService.submitReview({
        request_id: request.id,
        reviewer_id: presetReviewer.subject_id,
        options: {
          item_decisions: [
            {
              id: presetItem.id,
              decision: 'APPROVED',
              approved_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            },
            {
              id: directItem.id,
              decision: 'REJECTED',
            },
          ],
          decision_reason: 'Test',
        },
      });

      expect(reviewResult.status).toBe('PARTIALLY_APPROVED');

      const updatedItems = await prisma.access_request_item.findMany({
        where: { access_request_id: request.id },
      });

      const approvedItems = updatedItems.filter((i) => i.decision === 'APPROVED');
      const rejectedItems = updatedItems.filter((i) => i.decision === 'REJECTED');

      expect(approvedItems.length).toBeGreaterThan(0);
      expect(rejectedItems.length).toBeGreaterThan(0);
    });
  });
});
