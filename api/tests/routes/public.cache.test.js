/**
 * public.cache.test.js
 *
 * Changing `profile_visibility` leaves grants alone, and the public profile cache may serve the
 * old page for up to 300 seconds. A published profile is sent with that lifetime, and the route
 * refuses the profile as soon as it is private again, so only a cache holds the old page.
 *
 * @see docs/design/groups/design.md — Operation Effects
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
const publicRoutes = require('@/routes/public');
const profilesService = require('@/services/profiles');
const {
  createTestUser, createTestGroup, deleteGroup, deleteUser,
} = require('../services/helpers');

const app = express();
app.use(express.json());
app.use(initializePolicyContext);
app.use('/public', publicRoutes);
app.use(errorHandler);

let admin;
let group;

async function setVisibility(profile_visibility) {
  const current = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
  await profilesService.updateGroupProfile(group.id, {
    data: { profile_visibility },
    expected_version: current.version,
    actor_id: admin.subject_id,
  });
}

beforeAll(async () => {
  admin = await createTestUser('_pub_cache_admin');
  group = await createTestGroup(admin.subject_id, '_pub_cache_group');
  await prisma.group_user.create({ data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' } });
}, 30_000);

afterAll(async () => {
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

test('a published profile is cached for 300 seconds and refused once private', async () => {
  await setVisibility('PUBLIC');
  const published = await request(app).get(`/public/groups/${group.id}`);
  expect(published.status).toBe(200);
  expect(published.headers['cache-control']).toBe('public, max-age=300');

  await setVisibility('PRIVATE');
  const hidden = await request(app).get(`/public/groups/${group.id}`);
  expect(hidden.status).toBe(404);
  expect(hidden.headers['cache-control']).toBeUndefined();
});
