/**
 * users_v2.directory.test.js
 *
 * `GET /v2/users` for a group admin who is not a platform admin is a search, not a listing: a
 * term of at least three characters, at most ten people, and only name, username, email, and
 * subject id. A platform admin still reads the directory with roles and last login.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 15
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const { initializePolicyContext } = require('@/authorization');
const usersRoutes = require('@/routes/users_v2');
const {
  createTestUser, createTestGroup, deleteGroup, deleteUser,
} = require('../services/helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use(initializePolicyContext);
app.use('/v2/users', usersRoutes);
app.use(errorHandler);

const TAG = `dir_search${Date.now()}`;
let groupAdmin;
let platformAdmin;
let group;
const matches = [];

beforeAll(async () => {
  groupAdmin = await createTestUser('_dir_admin');
  platformAdmin = await createTestUser('_dir_platform');
  group = await createTestGroup(groupAdmin.subject_id, '_dir_group');
  await prisma.group_user.create({ data: { group_id: group.id, user_id: groupAdmin.subject_id, role: 'ADMIN' } });
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: role.id } });
  // Twelve people share the term, two more than one search may return.
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    matches.push(await prisma.user.create({
      data: {
        name: `Directory ${TAG} ${i}`,
        username: `${TAG}_${i}`,
        email: `${TAG}_${i}@test.invalid`,
        subject: { create: { type: 'USER' } },
      },
    }));
  }
}, 30_000);

afterAll(async () => {
  for (const user of matches) {
    // eslint-disable-next-line no-await-in-loop
    await deleteUser(user.id);
  }
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(platformAdmin.id);
  await deleteUser(groupAdmin.id);
  await prisma.$disconnect();
}, 30_000);

test('a search shorter than three characters is refused', async () => {
  currentUser = groupAdmin;
  const res = await request(app).get('/v2/users').query({ search: 'di' });
  expect(res.status).toBe(400);
  expect(res.body.message ?? res.text).toMatch(/search/);
});

test('a search returns at most ten people, with names and addresses only', async () => {
  currentUser = groupAdmin;
  const res = await request(app).get('/v2/users').query({ search: TAG, take: 50 });
  expect(res.status).toBe(200);
  // Forced unless more people match than one search may return.
  expect(matches.length).toBeGreaterThan(10);
  expect(res.body.users).toHaveLength(10);
  res.body.users.forEach((user) => {
    expect(Object.keys(user).sort()).toEqual(['email', 'name', 'subject_id', 'username']);
  });
});

test('a platform admin reads the directory with roles and last login', async () => {
  currentUser = platformAdmin;
  const res = await request(app).get('/v2/users').query({ search: TAG, take: 50 });
  expect(res.status).toBe(200);
  expect(res.body.users).toHaveLength(12);
  expect(res.body.users[0]).toHaveProperty('roles');
  expect(res.body.users[0]).toHaveProperty('login');
});
