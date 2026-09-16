/**
 * deleteRefusal.test.js
 *
 * A collection that has ever held a dataset is archived, not deleted. The service refuses the
 * delete with a 409, and the collection's state leaves `delete` out of `available_actions`, so
 * the page never offers it. An empty collection with no request still deletes.
 *
 * Which of the two answers carries this matters. `capabilities` says what the caller could do,
 * and a collection admin may delete collections — that does not change because this one has
 * history. Whether this collection admits a delete is its own state, read from the same
 * `has_history` the service asserts under its lock.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const collectionsService = require('@/services/collections');
const state = require('@/state');
const { authorizeAction, toCapabilitiesArray } = require('@/authorization');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestCollection,
  deleteCollection,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let admin;
let group;
let dataset;
let withHistory;
let empty;

beforeAll(async () => {
  admin = await createTestUser('_dr_admin');
  group = await createTestGroup(admin.subject_id, '_dr_group');
  await prisma.group_user.create({ data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' } });
  dataset = await createTestDataset(group.id, '_dr_ds');
  withHistory = await createTestCollection(group.id, admin.subject_id, '_dr_hist');
  empty = await createTestCollection(group.id, admin.subject_id, '_dr_empty');
  const change = { dataset_ids: [dataset.resource_id], actor_id: admin.subject_id };
  await collectionsService.addDatasets(withHistory.id, change);
  // Removed again, so only the history row says the collection ever held it.
  await collectionsService.removeDatasets(withHistory.id, change);
}, 30_000);

afterAll(async () => {
  await deleteCollection(withHistory.id).catch(() => {});
  await deleteCollection(empty.id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

const capabilitiesOn = async (collectionId) => {
  const permission = await authorizeAction('collection', 'view_metadata', {
    identifiers: { user: admin.subject_id, resource: collectionId },
    policyExecutionContext: { cache: { user: new Map(), resource: new Map(), context: new Map() } },
    shouldDeriveCapabilities: true,
  });
  return toCapabilitiesArray(permission.capabilities);
};

/** What the collection's own state admits, as the detail route reports it. */
const availableOn = async (collectionId) => state.availableActions(
  'collection',
  await state.readCollectionStateFields(prisma, collectionId),
);

test('a collection that once held a dataset is refused, and not offered delete', async () => {
  // Forced unless the history is only in the removed row: an active row would be refused anyway.
  expect(await prisma.active_collection_dataset.count({ where: { collection_id: withHistory.id } })).toBe(0);

  await expect(collectionsService.deleteCollection(withHistory.id, admin.subject_id))
    .rejects.toEqual(expect.objectContaining({ status: 409 }));
  expect(await prisma.collection.count({ where: { id: withHistory.id } })).toBe(1);

  // The admin still holds `delete` as a capability: having history is not a loss of authority.
  expect(await capabilitiesOn(withHistory.id)).toContain('delete');

  // The collection's state is what withholds it, which is what the page reads.
  const available = await availableOn(withHistory.id);
  expect(available).toContain('archive');
  expect(available).not.toContain('delete');
});

test('an empty collection is offered delete, and deletes', async () => {
  expect(await capabilitiesOn(empty.id)).toContain('delete');
  // Forced unless the state answer distinguishes the two collections: both callers are the
  // same admin, so only `has_history` can separate them.
  expect(await availableOn(empty.id)).toContain('delete');
  await collectionsService.deleteCollection(empty.id, admin.subject_id);
  expect(await prisma.collection.count({ where: { id: empty.id } })).toBe(0);
});
