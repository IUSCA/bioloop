/**
 * access_requests.create.test.js
 *
 * `POST /access-requests` is gated on the resource being asked for.
 *
 * The policy bound to the route is `Policy.always`, because the create body names a
 * `resource_id` and no resource type, so which policy container applies is not known until
 * the row is read. The real check runs in the handler. These tests hold that check in place:
 * before it landed, a user holding any resource UUID could file a request against a dataset
 * they could not see.
 *
 * @see docs/design/groups/access-requests-plan.md — A1
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');
const { randomUUID } = require('crypto');

const prisma = require('@/db');
// Submitting and reviewing write an in-app notification, which pulls in the SSE
// manager's two long-lived Redis connections. Without closing them the process never
// exits. @see docs/design/groups/access-requests-plan.md — D1
const { sseManager } = require('@/notification/inApp/sseManager');
const { errorHandler } = require('@/middleware/error');
const accessRequestRoutes = require('@/routes/access_requests');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteAccessRequests,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../services/helpers');

// The router reads `req.user` and nothing else off the request, so the authentication
// middleware is replaced by a switch the tests set. Mounting the whole app would start the
// TUS server for no gain.
let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = currentUser;
  next();
});
app.use('/access-requests', accessRequestRoutes);
app.use(errorHandler);

let admin;
let outsider;
let ownerGroup;
let dataset;
let viewMetadataTypeId;
let downloadTypeId;
let collectionViewTypeId;

const userIds = [];
const groupIds = [];
const datasetIds = [];
const requestIds = [];

beforeAll(async () => {
  admin = await createTestUser('_arc_admin');
  outsider = await createTestUser('_arc_out');
  userIds.push(admin.id, outsider.id);

  ownerGroup = await createTestGroup(admin.subject_id, '_arc_og');
  groupIds.push(ownerGroup.id);

  // createGroup records the actor for the audit trail; it does not enrol them.
  await prisma.group_user.create({
    data: {
      group_id: ownerGroup.id,
      user_id: admin.subject_id,
      role: 'ADMIN',
      assigned_by: admin.subject_id,
    },
  });

  dataset = await createTestDataset(ownerGroup.id, '_arc_ds');
  datasetIds.push(dataset.id);

  [viewMetadataTypeId, downloadTypeId, collectionViewTypeId] = await Promise.all([
    getAccessTypeId('DATASET:VIEW_METADATA'),
    getAccessTypeId('DATASET:DOWNLOAD'),
    getAccessTypeId('COLLECTION:VIEW_METADATA'),
  ]);
}, 30_000);

afterAll(async () => {
  await deleteAccessRequests({ requestIds });
  await prisma.group_user.deleteMany({ where: { user_id: { in: [admin.subject_id, outsider.subject_id] } } });
  await deleteAccessRequests({ requesterIds: [admin.subject_id, outsider.subject_id] });
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

function body(overrides = {}) {
  return {
    type: 'NEW',
    resource_id: dataset.resource_id,
    subject_id: currentUser.subject_id,
    purpose: 'testing the resource gate',
    items: [{ access_type_id: viewMetadataTypeId, requested_expiry: { type: 'never' } }],
    ...overrides,
  };
}

describe('POST /access-requests is gated on the resource', () => {
  test('a user who cannot see the dataset is refused', async () => {
    currentUser = outsider;

    const res = await request(app).post('/access-requests').send(body());

    expect(res.status).toBe(403);

    const filed = await prisma.access_request.count({
      where: { requester_id: outsider.subject_id, resource_id: dataset.resource_id },
    });
    expect(filed).toBe(0);
  }, 20_000);

  test('an admin of the owning group may file one', async () => {
    currentUser = admin;

    const res = await request(app).post('/access-requests').send(body());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    requestIds.push(res.body.id);
  }, 20_000);

  test('submit: true puts the new request under review in one call', async () => {
    currentUser = admin;

    const res = await request(app)
      .post('/access-requests')
      .send(body({
        submit: true,
        items: [{ access_type_id: downloadTypeId, requested_expiry: { type: 'never' } }],
      }));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('UNDER_REVIEW');
    expect(res.body.submitted_at).not.toBeNull();
    requestIds.push(res.body.id);
  }, 20_000);

  test('a resource that does not exist is a 404, not a 500', async () => {
    currentUser = admin;

    const res = await request(app)
      .post('/access-requests')
      .send(body({ resource_id: randomUUID() }));

    expect(res.status).toBe(404);
  }, 20_000);

  // `GET /access-requests/:id` hydrates `resource2` for the owning-group and oversight
  // arms of the read policy, and that hydrator filtered a relation with `has`, which
  // Prisma accepts only on a scalar list. Every read by a non-platform-admin was a 500.
  test('reading one request back works for the requester', async () => {
    currentUser = admin;

    const created = await request(app).post('/access-requests').send(body());
    requestIds.push(created.body.id);

    const res = await request(app).get(`/access-requests/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body._meta.capabilities).toEqual(expect.arrayContaining(['read']));
  }, 20_000);

  test('a COLLECTION access type cannot be asked for on a dataset', async () => {
    currentUser = admin;

    const res = await request(app)
      .post('/access-requests')
      .send(body({
        items: [{ access_type_id: collectionViewTypeId, requested_expiry: { type: 'never' } }],
      }));

    expect(res.status).toBe(400);
  }, 20_000);
});
