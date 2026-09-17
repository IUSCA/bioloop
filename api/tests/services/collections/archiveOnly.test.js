/**
 * archiveOnly.test.js
 *
 * A collection is archived, never deleted. This file pins that absence, so a delete route, a
 * policy action, or a state rule cannot come back without a test saying so.
 *
 * The page reads what a collection offers from `_meta.available_actions`, which the detail route
 * computes from the row `getCollectionById` fetches with the state layer's select fragment. So
 * the offer is checked off that row, against the real database, before and after archiving.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const collectionsService = require('@/services/collections');
const collectionRoutes = require('@/routes/collections');
const state = require('@/state');

const collectionState = state.import('collection');
const { policyRegistry } = require('@/authorization');
const {
  createTestUser,
  createTestGroup,
  createTestCollection,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let admin;
let group;
let collection;

beforeAll(async () => {
  admin = await createTestUser('_ao_admin');
  group = await createTestGroup(admin.subject_id, '_ao_group');
  collection = await createTestCollection(group.id, admin.subject_id, '_ao_coll');
}, 30_000);

afterAll(async () => {
  await deleteCollection(collection.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

/** What the collection's own state admits, read off the row the detail route fetches. */
const availableOn = async (collectionId) => collectionState.availableActions(
  await collectionsService.getCollectionById(collectionId),
);

test('no layer declares a collection delete', () => {
  expect(policyRegistry.get('collection').getActionNames()).not.toContain('delete');
  expect(state.stateRegistry.get('collection').getActionNames()).not.toContain('delete');
  expect(collectionsService).not.toHaveProperty('deleteCollection');
  const deletesTheCollection = collectionRoutes.stack
    .some((layer) => layer.route?.path === '/:id' && layer.route.methods.delete);
  expect(deletesTheCollection).toBe(false);
});

test('an open collection is offered archive, and an archived one unarchive', async () => {
  const open = await availableOn(collection.id);
  expect(open).toContain('archive');
  expect(open).not.toContain('unarchive');

  await collectionsService.archiveCollection(collection.id, admin.subject_id);
  const archived = await availableOn(collection.id);
  expect(archived).toContain('unarchive');
  expect(archived).not.toContain('archive');
  expect(archived).not.toContain('edit_metadata');
});
