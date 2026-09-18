/**
 * search.tagline.test.js
 *
 * Group and collection search match the tagline. The UI writes a tagline and no longer writes
 * `description`, so a search that read only name, slug, and description would find a new group
 * or collection by its name alone.
 *
 * Each search is run for a platform admin and for a group admin, because the two take different
 * queries (`searchAllGroups` and `searchGroupsForUser`, `searchAllCollections` and
 * `searchCollectionsForUser`). Every term is a fresh token that appears only in the tagline, so
 * a match can come from no other column.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { randomUUID } = require('crypto');
const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const { initializePolicyContext } = require('@/authorization');
const groupsService = require('@/services/groups');
const groupRoutes = require('@/routes/groups');
const collectionRoutes = require('@/routes/collections');
const {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  createTestCollection,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use(initializePolicyContext);
app.use('/groups', groupRoutes);
app.use('/collections', collectionRoutes);
app.use(errorHandler);

const token = () => `tagline${randomUUID().replace(/-/g, '')}`;

let platformAdmin;
let groupAdmin;
let parent;
let child;
let collection;
const childTagline = token();
const collectionTagline = token();

beforeAll(async () => {
  platformAdmin = await createTestUser('_tl_platform');
  const role = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: role.id } });
  groupAdmin = await createTestUser('_tl_admin');

  parent = await createTestGroup(platformAdmin.subject_id, '_tl_parent');
  child = await createTestChildGroup(parent.id, platformAdmin.subject_id, '_tl_child');
  await prisma.group_user.create({
    data: {
      group_id: parent.id, user_id: groupAdmin.subject_id, role: 'ADMIN', assigned_by: platformAdmin.subject_id,
    },
  });
  await prisma.group.update({ where: { id: child.id }, data: { tagline: `Sequencing for ${childTagline}` } });

  collection = await createTestCollection(parent.id, platformAdmin.subject_id, '_tl_coll');
  await prisma.collection.update({
    where: { id: collection.id }, data: { tagline: `Cohort ${collectionTagline}` },
  });
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
  await deleteCollection(collection.id).catch(() => {});
  await prisma.group_user.deleteMany({ where: { group_id: { in: [parent.id, child.id] } } });
  await deleteGroup(child.id).catch(() => {});
  await deleteGroup(parent.id).catch(() => {});
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  await deleteUser(groupAdmin.id);
  await deleteUser(platformAdmin.id);
  await prisma.$disconnect();
}, 30_000);

describe.each([
  ['a platform admin', () => platformAdmin],
  ['a group admin', () => groupAdmin],
])('search matches the tagline for %s', (_label, caller) => {
  beforeEach(() => {
    currentUser = caller();
  });

  test('POST /groups/search', async () => {
    const res = await request(app).post('/groups/search').send({ search_term: childTagline.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.data.map((g) => g.id)).toEqual([child.id]);
  });

  test('POST /collections/search', async () => {
    const res = await request(app).post('/collections/search').send({ search_term: collectionTagline });
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.id)).toEqual([collection.id]);
  });
});

describe('the group tree lookups match the tagline', () => {
  test('getGroupDescendants', async () => {
    const descendants = await groupsService.getGroupDescendants(parent.id, { search_term: childTagline });
    expect(descendants.map((g) => g.id)).toEqual([child.id]);
  });

  test('getGroupHierarchy', async () => {
    const roots = await groupsService.getGroupHierarchy({ search_term: childTagline });
    const ids = roots.flatMap((g) => [g.id, ...g._children.map((c) => c.id)]);
    expect(ids).toContain(child.id);
    expect(ids).not.toContain(parent.id);
  });
});
