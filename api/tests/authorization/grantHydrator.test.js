/**
 * grantHydrator.test.js
 *
 * The grant policies branch on whether a grant is on a dataset or a collection, and
 * `resource_type` is not a column on `grant`. Without a virtual attribute the default
 * hydrator raises `Unknown attributes: resource_type`, which reaches the caller as a 500 on
 * every grant action a non-platform-admin performs from an id alone — revoke, most visibly.
 *
 * A platform admin never sees it, because the engine allows them before any policy runs, so
 * a browser pass driven as a platform admin proves nothing here.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');

const prisma = require('@/db');
const { grantHydrator } = require('@/authorization/builtin/hydrators/grant');
const {
  createTestUser, createTestGroup, createTestDataset, createTestCollection, createTestGrant,
  getAccessTypeId, deleteUser, deleteGroup, deleteDataset, deleteCollection, deleteGrants,
} = require('../services/helpers');

let actor;
let group;
let dataset;
let collection;
let datasetGrant;
let collectionGrant;

beforeAll(async () => {
  actor = await createTestUser('_gh_actor');
  group = await createTestGroup(actor.subject_id, '_gh_group');
  dataset = await createTestDataset(group.id, '_gh_dataset');
  collection = await createTestCollection(group.id, actor.subject_id, '_gh_collection');

  datasetGrant = await createTestGrant({
    subject_id: actor.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: await getAccessTypeId('DATASET:VIEW_METADATA'),
    granted_by: actor.subject_id,
  });
  collectionGrant = await createTestGrant({
    subject_id: actor.subject_id,
    resource_id: collection.id,
    access_type_id: await getAccessTypeId('COLLECTION:VIEW_METADATA'),
    granted_by: actor.subject_id,
  });
}, 30000);

afterAll(async () => {
  await deleteGrants([datasetGrant.id, collectionGrant.id]);
  await deleteCollection(collection.id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(actor.id).catch(() => {});
  await prisma.$disconnect();
}, 30000);

describe('grant hydrator', () => {
  test('resolves resource_type for a grant on a dataset', async () => {
    const hydrated = await grantHydrator.hydrate({
      id: datasetGrant.id,
      attributes: ['resource_id', 'resource_type'],
    });
    expect(hydrated.resource_type).toBe('DATASET');
    expect(hydrated.resource_id).toBe(dataset.resource_id);
  });

  test('resolves resource_type for a grant on a collection', async () => {
    const hydrated = await grantHydrator.hydrate({
      id: collectionGrant.id,
      attributes: ['resource_id', 'resource_type'],
    });
    expect(hydrated.resource_type).toBe('COLLECTION');
    expect(hydrated.resource_id).toBe(collection.id);
  });
});
