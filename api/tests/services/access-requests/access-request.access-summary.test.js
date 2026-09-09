/**
 * access-request.access-summary.test.js
 *
 * An APPROVED request whose grants were all revoked reads as access the requester does not
 * have. The summary is derived from the live grants so no client has to infer it.
 *
 * @see docs/design/groups/access-requests-plan.md — C4
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
// Submitting and reviewing write an in-app notification, which pulls in the SSE
// manager's two long-lived Redis connections. Without closing them the process never
// exits. @see docs/design/groups/access-requests-plan.md — D1
const { sseManager } = require('@/notification/inApp/sseManager');
const arService = require('@/services/access_requests');
const grantsService = require('@/services/grants');
const Expiry = require('@/utils/expiry');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteAccessRequests,
  deleteUser,
  deleteGroup,
  deleteDataset,
} = require('../helpers');

let requester;
let reviewer;
let ownerGroup;
let dataset;
let downloadTypeId;
let listFilesTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];

beforeAll(async () => {
  requester = await createTestUser('_aras_req');
  reviewer = await createTestUser('_aras_rev');
  userIds.push(requester.id, reviewer.id);

  ownerGroup = await createTestGroup(reviewer.subject_id, '_aras_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_aras_ds');
  datasetIds.push(dataset.id);

  [downloadTypeId, listFilesTypeId] = await Promise.all([
    getAccessTypeId('DATASET:DOWNLOAD'),
    getAccessTypeId('DATASET:LIST_FILES'),
  ]);
}, 30_000);

afterAll(async () => {
  // grant.source_access_request_id is ON DELETE RESTRICT, so the grants an approval issued
  // must go before the request that issued them.
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
  await deleteAccessRequests({ requesterIds: [requester.subject_id] });
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

async function approvedRequest(accessTypeId) {
  const created = await arService.createAndSubmitAccessRequest({
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: requester.subject_id,
    purpose: 'summary test',
    items: [{ access_type_id: accessTypeId }],
  }, requester.subject_id);

  await arService.submitReview({
    request_id: created.id,
    reviewer_id: reviewer.subject_id,
    options: {
      decision_reason: 'approved for the test',
      item_decisions: created.access_request_items.map((item) => ({
        id: item.id,
        decision: 'APPROVED',
        approved_expiry: Expiry.fromJSON({ type: 'never' }),
      })),
    },
  });

  return created.id;
}

describe('grant provenance', () => {
  // A grant issued from an approved preset item carries both the request and the preset,
  // so the Access tab can say "via Standard Research Use" rather than listing five access
  // types with no shape.
  // @see docs/design/groups/access-requests-plan.md — C5
  test('a preset request stamps the preset on every grant it expands to', async () => {
    const preset = await prisma.grant_preset.findFirstOrThrow({
      where: { is_active: true, resource_types: { has: 'DATASET' } },
      include: { access_type_items: true },
    });

    const created = await arService.createAndSubmitAccessRequest({
      type: 'NEW',
      resource_id: dataset.resource_id,
      subject_id: requester.subject_id,
      purpose: 'preset provenance test',
      items: [{ preset_id: preset.id }],
    }, requester.subject_id);

    await arService.submitReview({
      request_id: created.id,
      reviewer_id: reviewer.subject_id,
      options: {
        decision_reason: 'approved for the test',
        item_decisions: created.access_request_items.map((item) => ({
          id: item.id,
          decision: 'APPROVED',
          approved_expiry: Expiry.fromJSON({ type: 'never' }),
        })),
      },
    });

    const issued = await prisma.grant.findMany({
      where: { source_access_request_id: created.id },
      select: { source_preset_id: true, access_type_id: true },
    });

    expect(issued.length).toBeGreaterThan(0);
    for (const g of issued) {
      expect(g.source_preset_id).toBe(preset.id);
    }
  }, 30_000);
});

describe('access summary', () => {
  test('an approval with a live grant reports one live grant', async () => {
    const requestId = await approvedRequest(downloadTypeId);

    const request = await arService.getRequestById(requestId);

    expect(request.access_summary.issued).toBe(1);
    expect(request.access_summary.live).toBe(1);
    expect(request.access_summary.revoked).toBe(0);
    expect(request.access_summary.last_revoked_at).toBeNull();
  }, 30_000);

  test('revoking the grant leaves the request APPROVED with nothing live', async () => {
    const requestId = await approvedRequest(listFilesTypeId);

    const grants = await prisma.grant.findMany({
      where: { source_access_request_id: requestId },
      select: { id: true },
    });
    expect(grants).toHaveLength(1);

    await grantsService.revokeGrant(grants[0].id, {
      actor_id: reviewer.subject_id,
      reason: 'no longer needed',
    });

    const request = await arService.getRequestById(requestId);

    expect(request.status).toBe('APPROVED');
    expect(request.access_summary.issued).toBe(1);
    expect(request.access_summary.live).toBe(0);
    expect(request.access_summary.revoked).toBe(1);
    expect(request.access_summary.last_revoked_at).not.toBeNull();
    expect(request.access_summary.last_revocation_type).toBe('MANUAL');
  }, 30_000);

  test('a listing carries the same counts without a query per row', async () => {
    const { data } = await arService.getRequestsByUser({
      requester_id: requester.subject_id,
      sort_by: 'created_at',
      sort_order: 'desc',
      offset: 0,
      limit: 100,
    });

    expect(data.length).toBeGreaterThan(0);
    for (const request of data) {
      expect(request.access_summary).toBeDefined();
      expect(request.access_summary.issued).toBe(
        request.access_summary.live
        + request.access_summary.revoked
        + request.access_summary.expired,
      );
    }
  }, 30_000);
});
