/**
 * access_requests.preview.test.js
 *
 * `POST /access-requests/compute-effective-grants` shows a requester what their request would
 * confer if approved as asked. It must refuse whoever filing would refuse, write nothing, and
 * answer with less than the reviewer's preview carries.
 *
 * @see docs/design/groups/ui-information-architecture.md — Access types in forms
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { sseManager } = require('@/notification/inApp/sseManager');
const { errorHandler } = require('@/middleware/error');
const accessRequestRoutes = require('@/routes/access_requests');
const baseAttributes = require('@/authorization/builtin/policies/base_attributes');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestGrant,
  getAccessTypeId,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../services/helpers');

// The router reads `req.user` and nothing else off the request, as in
// access_requests.create.test.js.
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
let downloadTypeId;
let collectionViewTypeId;

beforeAll(async () => {
  admin = await createTestUser('_arp_admin');
  outsider = await createTestUser('_arp_out');

  ownerGroup = await createTestGroup(admin.subject_id, '_arp_og');
  await prisma.group_user.create({
    data: {
      group_id: ownerGroup.id,
      user_id: admin.subject_id,
      role: 'ADMIN',
      assigned_by: admin.subject_id,
    },
  });

  dataset = await createTestDataset(ownerGroup.id, '_arp_ds');

  [downloadTypeId, collectionViewTypeId] = await Promise.all([
    getAccessTypeId('DATASET:DOWNLOAD'),
    getAccessTypeId('COLLECTION:VIEW_METADATA'),
  ]);
}, 30_000);

afterAll(async () => {
  await prisma.group_user.deleteMany({ where: { user_id: { in: [admin.subject_id, outsider.subject_id] } } });
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(ownerGroup.id).catch(() => {});
  for (const u of [admin, outsider]) await deleteUser(u.id).catch(() => {});
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

function body(overrides = {}) {
  return {
    resource_id: dataset.resource_id,
    subject_id: currentUser.subject_id,
    items: [{ access_type_id: downloadTypeId, requested_expiry: { type: 'never' } }],
    ...overrides,
  };
}

const preview = (payload) => request(app).post('/access-requests/compute-effective-grants').send(payload);

describe('POST /access-requests/compute-effective-grants refuses as filing does', () => {
  test('a user who cannot see the dataset is refused as if it did not exist', async () => {
    currentUser = outsider;
    const res = await preview(body());
    expect(res.status).toBe(404);
  }, 20_000);

  test('asking on behalf of another user is forbidden', async () => {
    currentUser = admin;
    const res = await preview(body({ subject_id: outsider.subject_id }));
    expect(res.status).toBe(403);
  }, 20_000);

  test('a COLLECTION access type cannot be previewed on a dataset', async () => {
    currentUser = admin;
    const res = await preview(body({
      items: [{ access_type_id: collectionViewTypeId, requested_expiry: { type: 'never' } }],
    }));
    expect(res.status).toBe(400);
  }, 20_000);
});

describe('POST /access-requests/compute-effective-grants previews without writing', () => {
  test('a type nobody holds is new, and a group admin may preview for the group', async () => {
    currentUser = admin;
    const grantsBefore = await prisma.grant.count({ where: { resource_id: dataset.resource_id } });

    const self = await preview(body());
    expect(self.status).toBe(200);
    expect(self.body).toEqual([
      expect.objectContaining({ type: 'new', access_type_id: downloadTypeId, indirect_coverage: [] }),
    ]);

    const forGroup = await preview(body({ subject_id: ownerGroup.id }));
    expect(forGroup.status).toBe(200);
    expect(forGroup.body[0].type).toBe('new');

    const grantsAfter = await prisma.grant.count({ where: { resource_id: dataset.resource_id } });
    expect(grantsAfter).toBe(grantsBefore);
  }, 20_000);

  test('access held through a group is named, and only with coverage attributes', async () => {
    currentUser = admin;
    await createTestGrant({
      subject_id: ownerGroup.id,
      resource_id: dataset.resource_id,
      access_type_id: downloadTypeId,
      granted_by: admin.subject_id,
    });

    const res = await preview(body());

    expect(res.status).toBe(200);
    const [row] = res.body;
    expect(row.type).toBe('new');
    expect(row.indirect_coverage).toEqual([
      expect.objectContaining({ via: 'GROUP', via_group_id: ownerGroup.id }),
    ]);
    for (const cover of row.indirect_coverage) {
      expect(Object.keys(cover).every((k) => baseAttributes.coverage.includes(k))).toBe(true);
    }
  }, 20_000);

  test('a direct grant is existing, and its row carries only expiry and access type', async () => {
    currentUser = admin;
    await createTestGrant({
      subject_id: admin.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: downloadTypeId,
      granted_by: admin.subject_id,
    });

    const res = await preview(body());

    expect(res.status).toBe(200);
    const [row] = res.body;
    expect(row.type).toBe('existing');
    expect(row.existingGrant.expiry).toEqual({ type: 'never', value: null });
    expect(Object.keys(row.existingGrant).every((k) => ['expiry', 'access_type'].includes(k))).toBe(true);
  }, 20_000);
});
