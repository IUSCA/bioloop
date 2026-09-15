/**
 * access-request.create-and-submit.test.js
 *
 * `createAndSubmitAccessRequest` creates a request and puts it under review in one
 * transaction.
 *
 * A DRAFT is invisible: no surface lists one, and the drafts UI is gone. Two calls from the
 * client would strand a row the requester could neither see nor resume if the second failed,
 * so the two steps commit together or not at all.
 *
 * @see docs/design/groups/implementation/access-requests-plan.md — B1
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
// Submitting and reviewing write an in-app notification, which pulls in the SSE
// manager's two long-lived Redis connections. Without closing them the process never
// exits. @see docs/design/groups/implementation/access-requests-plan.md — D1
const { sseManager } = require('@/notification/inApp/sseManager');
const arService = require('@/services/access_requests');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit');
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
let ownerGroup;
let dataset;
let viewMetadataTypeId;
let downloadTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];

beforeAll(async () => {
  requester = await createTestUser('_arcs_req');
  userIds.push(requester.id);

  ownerGroup = await createTestGroup(requester.subject_id, '_arcs_og');
  groupIds.push(ownerGroup.id);

  dataset = await createTestDataset(ownerGroup.id, '_arcs_ds');
  datasetIds.push(dataset.id);

  [viewMetadataTypeId, downloadTypeId] = await Promise.all([
    getAccessTypeId('DATASET:VIEW_METADATA'),
    getAccessTypeId('DATASET:DOWNLOAD'),
  ]);
}, 30_000);

afterAll(async () => {
  await deleteAccessRequests({ requesterIds: [requester.subject_id] });
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

function payload(items) {
  return {
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: requester.subject_id,
    purpose: 'create and submit in one transaction',
    items,
  };
}

async function closeOpenRequests() {
  await prisma.access_request.updateMany({
    where: {
      requester_id: requester.subject_id,
      status: { in: ['DRAFT', 'UNDER_REVIEW'] },
    },
    data: { status: 'WITHDRAWN', closed_at: new Date() },
  });
}

describe('createAndSubmitAccessRequest', () => {
  afterEach(closeOpenRequests);

  test('leaves the request UNDER_REVIEW with submitted_at set', async () => {
    const ar = await arService.createAndSubmitAccessRequest(
      payload([{ access_type_id: viewMetadataTypeId }]),
      requester.subject_id,
    );

    expect(ar.status).toBe('UNDER_REVIEW');
    expect(ar.submitted_at).not.toBeNull();
    expect(ar.access_request_items).toHaveLength(1);
  }, 20_000);

  test('writes both audit events, so neither state is skipped', async () => {
    const ar = await arService.createAndSubmitAccessRequest(
      payload([{ access_type_id: downloadTypeId }]),
      requester.subject_id,
    );

    const events = await prisma.authorization_audit.findMany({
      where: { target_type: 'ACCESS_REQUEST', target_id: ar.id },
      select: { event_type: true },
    });

    const types = events.map((e) => e.event_type);
    expect(types).toContain(AUTH_EVENT_TYPE.REQUEST_CREATED);
    expect(types).toContain(AUTH_EVENT_TYPE.REQUEST_SUBMITTED);
  }, 20_000);

  test('a submit that fails leaves no request behind', async () => {
    // One request already under review for this access type makes the pre-flight
    // in-flight check throw, which happens inside the same transaction as the create.
    await arService.createAndSubmitAccessRequest(
      payload([{ access_type_id: viewMetadataTypeId }]),
      requester.subject_id,
    );

    const before = await prisma.access_request.count({
      where: { requester_id: requester.subject_id },
    });

    await expect(
      arService.createAndSubmitAccessRequest(
        payload([{ access_type_id: viewMetadataTypeId }]),
        requester.subject_id,
      ),
    ).rejects.toThrow();

    const after = await prisma.access_request.count({
      where: { requester_id: requester.subject_id },
    });
    expect(after).toBe(before);
  }, 20_000);
});
