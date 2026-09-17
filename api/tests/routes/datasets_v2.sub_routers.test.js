/**
 * datasets_v2.sub_routers.test.js
 *
 * The files and workflows sub-routers address a dataset by its resource UUID, and
 * `dataset_file.dataset_id` and `workflow.dataset_id` are integer keys. Each write below failed
 * with a Prisma validation error while it passed the UUID straight through, and nothing caught it
 * because no caller reached the route.
 *
 * `edit` is platform-admin only, because the workers are the callers, so the caller here is one.
 */

const path = require('path');
const { randomUUID } = require('crypto');

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
let dataset;

beforeAll(async () => {
  admin = await createTestUser('_sub_router_admin');
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: admin.id, role_id: role.id } });
  group = await createTestGroup(admin.subject_id, '_sub_router_group');
  dataset = await createTestDataset(group.id, '_sub_router_ds');
  currentUser = admin;
}, 30_000);

afterAll(async () => {
  await prisma.workflow.deleteMany({ where: { dataset_id: dataset.id } }).catch(() => {});
  await prisma.grant.deleteMany({ where: { resource_id: dataset.resource_id } }).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id).catch(() => {});
  await prisma.$disconnect();
});

describe('POST /v2/datasets/:dataset_resource_id/files', () => {
  test('stores the files, and the directories they imply, against the integer key', async () => {
    const res = await request(app)
      .post(`/v2/datasets/${dataset.resource_id}/files`)
      .send([{
        path: 'reads/sample.fastq', size: 12, md5: 'abc', type: 'file',
      }]);

    expect(res.status).toBe(204);
    const rows = await prisma.dataset_file.findMany({
      where: { dataset_id: dataset.id },
      select: { path: true, filetype: true },
      orderBy: { path: 'asc' },
    });
    // The root is a directory row with an empty path; listFiles starts from it.
    expect(rows).toEqual([
      { path: '', filetype: 'directory' },
      { path: 'reads', filetype: 'directory' },
      { path: 'reads/sample.fastq', filetype: 'file' },
    ]);
  });
});

describe('GET /v2/datasets/:dataset_resource_id/files/search', () => {
  test('finds files by name without the route resolving the id itself', async () => {
    const res = await request(app)
      .get(`/v2/datasets/${dataset.resource_id}/files/search`)
      .query({ name: 'sample' });

    expect(res.status).toBe(200);
    expect(res.body.map((f) => f.path)).toEqual(['reads/sample.fastq']);
  });
});

describe('PUT /v2/datasets/:dataset_resource_id/workflows/:workflow_id', () => {
  test('associates the run with the dataset\'s integer key', async () => {
    const workflow_id = randomUUID();
    const res = await request(app)
      .put(`/v2/datasets/${dataset.resource_id}/workflows/${workflow_id}`);

    expect(res.status).toBe(204);
    const row = await prisma.workflow.findUnique({ where: { id: workflow_id } });
    expect(row).not.toBeNull();
    expect(row.dataset_id).toBe(dataset.id);
  });
});

describe('the sub-routers refuse an id that is not a resource UUID', () => {
  test.each([
    ['files', 'get', ''],
    ['workflows', 'get', ''],
  ])('%s answers 400 for the integer key', async (subRouter, method, suffix) => {
    const res = await request(app)[method](`/v2/datasets/${dataset.id}/${subRouter}${suffix}`);
    expect(res.status).toBe(400);
  });
});
