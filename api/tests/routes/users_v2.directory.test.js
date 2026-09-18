/**
 * users_v2.directory.test.js
 *
 * `GET /v2/users` answers two different questions depending on who asks. A platform admin reads
 * the account record, with roles and last login. Everyone else the policy admits reads the
 * directory: name, username, email, and subject id, for any term of any length.
 *
 * What separates the two is the shape of the row, not the size of the result. A term length
 * floor used to stand in for a privacy rule and only ever produced an empty dropdown a person
 * could not tell from a name nobody has.
 *
 * @see docs/design/groups/user-directory.md — Who may search, and what a search returns
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
const directory = require('@/services/user_directory');
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
let plainMember;
let group;
const matches = [];

beforeAll(async () => {
  groupAdmin = await createTestUser('_dir_admin');
  platformAdmin = await createTestUser('_dir_platform');
  plainMember = await createTestUser('_dir_member');
  group = await createTestGroup(groupAdmin.subject_id, '_dir_group');
  await prisma.group_user.create({ data: { group_id: group.id, user_id: groupAdmin.subject_id, role: 'ADMIN' } });
  // A member of the same group, so the refusal is about the role rather than about belonging.
  await prisma.group_user.create({ data: { group_id: group.id, user_id: plainMember.subject_id, role: 'MEMBER' } });
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
  await deleteUser(plainMember.id);
  await deleteUser(groupAdmin.id);
  await prisma.$disconnect();
}, 30_000);

test.each([['d'], ['di'], ['dir']])('a search of %p is answered, not refused', async (term) => {
  currentUser = groupAdmin;
  const res = await request(app).get('/v2/users').query({ search: term });

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.users)).toBe(true);
});

test('a one-character search reaches the people it matches', async () => {
  currentUser = groupAdmin;
  // The tag starts with `dir_search`, so a single `d` has to reach these twelve. This is what
  // the old three-character floor made impossible, and what the picker showed as "No results".
  const res = await request(app).get('/v2/users').query({ search: 'd', take: 100 });

  const usernames = res.body.users.map((u) => u.username);
  expect(usernames).toEqual(expect.arrayContaining([`${TAG}_0`]));
});

test('an empty search lists the directory rather than nothing', async () => {
  currentUser = groupAdmin;
  const res = await request(app).get('/v2/users').query({ take: 100 });

  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeGreaterThan(0);
  // The count is the whole match, not the page, so a picker can say how much it is not showing.
  expect(res.body.metadata.count).toBeGreaterThanOrEqual(res.body.users.length);
});

test('a row carries names and addresses only, never roles or login times', async () => {
  currentUser = groupAdmin;
  const res = await request(app).get('/v2/users').query({ search: TAG, take: 50 });

  expect(res.status).toBe(200);
  expect(res.body.users.length).toBeGreaterThan(0);
  res.body.users.forEach((user) => {
    expect(Object.keys(user).sort()).toEqual(['email', 'name', 'subject_id', 'username']);
  });
});

test('take reaches past ten, and is capped at the page maximum', async () => {
  currentUser = groupAdmin;
  // Forced unless more people match than the old ten-row cap allowed.
  expect(matches.length).toBeGreaterThan(10);

  const res = await request(app).get('/v2/users').query({ search: TAG, take: 50 });
  expect(res.body.users).toHaveLength(matches.length);

  const capped = await request(app).get('/v2/users').query({ search: TAG, take: 1000 });
  expect(capped.body.users.length).toBeLessThanOrEqual(directory.MAX_PEOPLE_PER_PAGE);
});

test('skip pages through the matches', async () => {
  currentUser = groupAdmin;
  const first = await request(app).get('/v2/users').query({ search: TAG, take: 5 });
  const second = await request(app).get('/v2/users').query({ search: TAG, take: 5, skip: 5 });

  expect(first.body.users).toHaveLength(5);
  expect(second.body.users).toHaveLength(5);
  expect(second.body.users[0].username).not.toBe(first.body.users[0].username);
  // Both pages report the same total, which is what makes paging possible.
  expect(second.body.metadata.count).toBe(first.body.metadata.count);
});

test('a deleted account is not in the directory', async () => {
  currentUser = groupAdmin;
  await prisma.user.update({ where: { id: matches[0].id }, data: { is_deleted: true } });

  try {
    const res = await request(app).get('/v2/users').query({ search: TAG, take: 100 });
    expect(res.body.users.map((u) => u.username)).not.toContain(`${TAG}_0`);
  } finally {
    await prisma.user.update({ where: { id: matches[0].id }, data: { is_deleted: false } });
  }
});

test('a member who administers no group still cannot search at all', async () => {
  // The directory widened; who may open it did not. `list` is `isAdminOfAnyGroup`.
  currentUser = plainMember;
  const res = await request(app).get('/v2/users').query({ search: TAG });

  expect(res.status).toBe(403);
});

test('a platform admin reads the directory with roles and last login', async () => {
  currentUser = platformAdmin;
  const res = await request(app).get('/v2/users').query({ search: TAG, take: 50 });
  expect(res.status).toBe(200);
  expect(res.body.users).toHaveLength(12);
  expect(res.body.users[0]).toHaveProperty('roles');
  expect(res.body.users[0]).toHaveProperty('login');
});
