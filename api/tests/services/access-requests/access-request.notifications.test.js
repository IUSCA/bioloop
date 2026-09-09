/**
 * access-request.notifications.test.js
 *
 * Submitting a request notifies the people who can decide it; deciding it notifies the
 * person who asked. People do not poll a portal, and an un-notified approval reads as a
 * rejection.
 *
 * @see docs/design/groups/access-requests-plan.md — D1
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
// Submitting and reviewing write an in-app notification, which pulls in the SSE manager's
// two long-lived Redis connections. Without closing them the process never exits.
const { sseManager } = require('@/notification/inApp/sseManager');
const arService = require('@/services/access_requests');
const { findReviewers } = require('@/services/access_requests/notify');
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
let admin;
let bystander;
let ownerGroup;
let dataset;
let downloadTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];

beforeAll(async () => {
  requester = await createTestUser('_arn_req');
  admin = await createTestUser('_arn_admin');
  bystander = await createTestUser('_arn_by');
  userIds.push(requester.id, admin.id, bystander.id);

  ownerGroup = await createTestGroup(admin.subject_id, '_arn_og');
  groupIds.push(ownerGroup.id);

  await prisma.group_user.createMany({
    data: [
      { group_id: ownerGroup.id, user_id: admin.subject_id, role: 'ADMIN' },
      { group_id: ownerGroup.id, user_id: bystander.subject_id, role: 'MEMBER' },
    ],
    skipDuplicates: true,
  });

  dataset = await createTestDataset(ownerGroup.id, '_arn_ds');
  datasetIds.push(dataset.id);

  downloadTypeId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30_000);

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } });
  await deleteAccessRequests({ requesterIds: [requester.subject_id] });
  await prisma.group_user.deleteMany({ where: { group_id: ownerGroup.id } });
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

function notificationsFor(userId) {
  return prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
  });
}

describe('access request notifications', () => {
  let requestId;

  test('the reviewers are the owning group admins, and only them', async () => {
    const reviewers = await findReviewers(dataset.resource_id);

    expect(reviewers.map((r) => r.id)).toEqual([admin.id]);
  }, 20_000);

  test('submitting notifies the reviewers and not the requester', async () => {
    const created = await arService.createAndSubmitAccessRequest({
      type: 'NEW',
      resource_id: dataset.resource_id,
      subject_id: requester.subject_id,
      purpose: 'notification test',
      items: [{ access_type_id: downloadTypeId }],
    }, requester.subject_id);
    requestId = created.id;

    const [forAdmin, forRequester, forBystander] = await Promise.all([
      notificationsFor(admin.id),
      notificationsFor(requester.id),
      notificationsFor(bystander.id),
    ]);

    expect(forAdmin).toHaveLength(1);
    expect(forAdmin[0].type).toBe('request');
    expect(forAdmin[0].title).toContain(dataset.name);
    expect(forAdmin[0].payload.actionUrl).toBe(`/v2/access-requests/${requestId}`);
    expect(forRequester).toHaveLength(0);
    expect(forBystander).toHaveLength(0);
  }, 30_000);

  test('deciding notifies the requester with the outcome', async () => {
    const request = await arService.getRequestById(requestId);

    await arService.submitReview({
      request_id: requestId,
      reviewer_id: admin.subject_id,
      options: {
        decision_reason: 'fine by me',
        item_decisions: request.access_request_items.map((item) => ({
          id: item.id,
          decision: 'APPROVED',
          approved_expiry: Expiry.fromJSON({ type: 'never' }),
        })),
      },
    });

    const forRequester = await notificationsFor(requester.id);

    expect(forRequester).toHaveLength(1);
    expect(forRequester[0].title).toContain('approved');
    expect(forRequester[0].body).toBe('fine by me');
    expect(forRequester[0].payload.actionUrl).toBe(`/v2/access-requests/${requestId}`);
  }, 30_000);
});
