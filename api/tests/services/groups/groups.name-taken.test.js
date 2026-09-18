/**
 * groups.name-taken.test.js
 *
 * `group.name` is unique across every group. Creating or renaming a group to a name another group
 * holds answers 409 with `field: 'name'`, so a form can mark the input, and with a message that
 * names no other group, because the holder may be one the caller cannot see.
 *
 * Both are driven through the routes, because `field` reaching the response body is the contract
 * the UI reads.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler, prismaConstraintFailedHandler } = require('@/middleware/error');
const { initializePolicyContext } = require('@/authorization');
const groupRoutes = require('@/routes/groups');
const {
  createTestUser,
  createTestGroup,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use(initializePolicyContext);
app.use('/groups', groupRoutes);
app.use(prismaConstraintFailedHandler);
app.use(errorHandler);

let platformAdmin;
let holder;
let renamed;
const groupsToDelete = [];

beforeAll(async () => {
  platformAdmin = await createTestUser('_nt_platform');
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: role.id } });
  currentUser = platformAdmin;

  holder = await createTestGroup(platformAdmin.subject_id, '_nt_holder');
  renamed = await createTestGroup(platformAdmin.subject_id, '_nt_renamed');
  groupsToDelete.push(holder.id, renamed.id);
}, 30_000);

afterAll(async () => {
  for (const id of groupsToDelete) await deleteGroup(id).catch(() => {});
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  await deleteUser(platformAdmin.id);
  await prisma.$disconnect();
}, 30_000);

function expectNameTaken(res) {
  expect(res.status).toBe(409);
  expect(res.body.field).toBe('name');
  expect(res.body.message).toMatch(/already taken/);
  expect(JSON.stringify(res.body)).not.toContain(holder.id);
}

test('POST /groups with a taken name', async () => {
  const before = await prisma.group.count();
  const res = await request(app).post('/groups').send({ name: holder.name });

  expectNameTaken(res);
  expect(await prisma.group.count()).toBe(before);
});

test('PATCH /groups/:id renaming to a taken name', async () => {
  const res = await request(app).patch(`/groups/${renamed.id}`).send({ version: renamed.version, name: holder.name });

  expectNameTaken(res);
  const row = await prisma.group.findUniqueOrThrow({ where: { id: renamed.id }, select: { name: true } });
  expect(row.name).toBe(renamed.name);
});

test('a 409 that is not about the name carries no field', async () => {
  // A stale version is the other 409 the rename can give, and the form must not mark the name.
  const res = await request(app).patch(`/groups/${renamed.id}`)
    .send({ version: renamed.version + 99, name: 'x_unused_name' });

  expect(res.status).toBe(409);
  expect(res.body.field).toBeUndefined();
});
