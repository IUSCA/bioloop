/**
 * datasets_v2.patch.test.js
 *
 * `PATCH /v2/datasets/:id` accepts `name` and `description` and nothing else. A route that
 * passed the body to the update whole would let an admin of the owning group move the dataset
 * to any group, flip `is_deleted`, or rewrite `archive_path`, with no audit row.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const datasetRoutes = require('@/routes/datasets_v2');
const {
  createTestUser, createTestGroup, createTestDataset, deleteGroup, deleteUser, deleteDataset,
} = require('../services/helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use('/v2/datasets', datasetRoutes);
app.use(errorHandler);

let admin;
let group;
let otherGroup;
let dataset;

beforeAll(async () => {
  admin = await createTestUser('_patch_admin');
  group = await createTestGroup(admin.subject_id, '_patch_group');
  otherGroup = await createTestGroup(admin.subject_id, '_patch_other');
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
  });
  dataset = await createTestDataset(group.id, '_patch_ds', { archive_path: '/original/path' });
  currentUser = admin;
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } }).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteGroup(otherGroup.id).catch(() => {});
  await deleteUser(admin.id).catch(() => {});
  await prisma.$disconnect();
});

test('fields the route does not document are ignored', async () => {
  const res = await request(app)
    .patch(`/v2/datasets/${dataset.resource_id}`)
    .send({
      name: `${dataset.name}_renamed`,
      owner_group_id: otherGroup.id,
      is_deleted: true,
      archive_path: '/rewritten',
    });
  expect(res.status).toBe(200);

  const row = await prisma.dataset.findUnique({ where: { id: dataset.id } });
  expect({
    name: row.name,
    owner_group_id: row.owner_group_id,
    is_deleted: row.is_deleted,
    archive_path: row.archive_path,
  }).toEqual({
    name: `${dataset.name}_renamed`,
    owner_group_id: group.id,
    is_deleted: false,
    archive_path: '/original/path',
  });
});
