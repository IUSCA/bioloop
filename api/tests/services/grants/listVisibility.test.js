/**
 * listVisibility.test.js
 *
 * A list shows a dataset or a collection only when its page opens for the caller. For each
 * grant shape below, the dataset list, the collection list, and the collection page's
 * per-row flag must all agree with the `view_metadata` decision the page itself makes.
 *
 * The shapes that matter most are the ones where a grant implies nothing across resource
 * types. A bare COLLECTION:LIST_CONTENTS lets a caller open the collection and not the
 * datasets in it; DATASET:VIEW_METADATA issued on a collection does the reverse.
 *
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const datasetService = require('@/services/datasets_v2');
const collectionService = require('@/services/collections');
const grantService = require('@/services/grants');
const { AUTHENTICATED_USERS_GROUP_ID } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestCollection,
  createTestGrant,
  getAccessTypeId,
  deleteGrantsForResource,
  deleteDataset,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

const DISCOVERABLE = ['DATASET:VIEW_METADATA', 'COLLECTION:VIEW_METADATA'];

// `on` names the resource the grant is issued on. `datasetOpens` and `collectionOpens` are
// the expected page decisions; the test asserts every list agrees with them.
const CASES = [
  {
    label: 'no grant', on: 'collection', types: [], datasetOpens: false, collectionOpens: false,
  },
  {
    label: 'bare COLLECTION:LIST_CONTENTS on the collection',
    on: 'collection',
    types: ['COLLECTION:LIST_CONTENTS'],
    datasetOpens: false,
    collectionOpens: true,
  },
  {
    label: 'COLLECTION:VIEW_METADATA on the collection',
    on: 'collection',
    types: ['COLLECTION:VIEW_METADATA'],
    datasetOpens: false,
    collectionOpens: true,
  },
  {
    label: 'DATASET:VIEW_METADATA on the collection',
    on: 'collection',
    types: ['DATASET:VIEW_METADATA'],
    datasetOpens: true,
    collectionOpens: false,
  },
  {
    label: 'the Discoverable preset types on the collection',
    on: 'collection',
    types: DISCOVERABLE,
    datasetOpens: true,
    collectionOpens: true,
  },
  {
    label: 'DATASET:VIEW_METADATA on the dataset',
    on: 'dataset',
    types: ['DATASET:VIEW_METADATA'],
    datasetOpens: true,
    collectionOpens: false,
  },
  {
    label: 'DATASET:DOWNLOAD on the dataset',
    on: 'dataset',
    types: ['DATASET:DOWNLOAD'],
    datasetOpens: true,
    collectionOpens: false,
  },
  {
    label: 'DATASET:LIST_FILES on the dataset, to Authenticated Users',
    on: 'dataset',
    types: ['DATASET:LIST_FILES'],
    subject: AUTHENTICATED_USERS_GROUP_ID,
    datasetOpens: true,
    collectionOpens: false,
  },
];

let actor;
let viewer;
let group;
const datasets = [];
const collections = [];

beforeAll(async () => {
  actor = await createTestUser('_lv_actor');
  viewer = await createTestUser('_lv_viewer');
  group = await createTestGroup(actor.subject_id, '_lv_group');
}, 30_000);

afterAll(async () => {
  for (const c of collections) {
    await deleteGrantsForResource(c.id).catch(() => {});
    await deleteCollection(c.id).catch(() => {});
  }
  for (const d of datasets) {
    await deleteGrantsForResource(d.resource_id).catch(() => {});
    await deleteDataset(d.id).catch(() => {});
  }
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(viewer.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

/** One dataset in one collection, both owned by a group the viewer does not belong to. */
async function buildWorld(tag) {
  const dataset = await createTestDataset(group.id, tag);
  datasets.push(dataset);
  const collection = await createTestCollection(group.id, actor.subject_id, tag);
  collections.push(collection);
  await prisma.collection_dataset.create({
    data: { collection_id: collection.id, dataset_id: dataset.resource_id, added_by: actor.subject_id },
  });
  return { dataset, collection };
}

describe('every list agrees with the page it links to', () => {
  test.each(CASES)('$label', async ({
    label, on, types, subject, datasetOpens, collectionOpens,
  }) => {
    const { dataset, collection } = await buildWorld(`_lv_${CASES.findIndex((c) => c.label === label)}`);
    for (const type of types) {
      await createTestGrant({
        subject_id: subject ?? viewer.subject_id,
        resource_id: on === 'dataset' ? dataset.resource_id : collection.id,
        access_type_id: await getAccessTypeId(type),
        granted_by: actor.subject_id,
      });
    }

    const datasetPage = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: viewer.subject_id, resource: dataset.resource_id },
    });
    const collectionPage = await authorizeAction('collection', 'view_metadata', {
      identifiers: { user: viewer.subject_id, resource: collection.id },
    });

    const datasetList = await datasetService.searchDatasetsForUser({
      user_id: viewer.subject_id,
      filters: { is_deleted: false, collection_id: collection.id },
      pagination: { limit: 10, offset: 0 },
      sort: { sort_by: 'updated_at', sort_order: 'desc' },
      includes: {},
    });
    const collectionList = await collectionService.searchCollectionsForUser({
      user_id: viewer.subject_id,
      owner_group_id: group.id,
      sort_by: 'name',
      sort_order: 'asc',
      limit: 100,
      offset: 0,
    });
    const viewable = await datasetService.viewableDatasetIds(viewer.subject_id, [dataset.resource_id]);

    expect({
      page: datasetPage.granted,
      datasetList: datasetList.data.some((d) => d.resource_id === dataset.resource_id),
      collectionTabFlag: viewable.has(dataset.resource_id),
    }).toEqual({ page: datasetOpens, datasetList: datasetOpens, collectionTabFlag: datasetOpens });

    expect({
      page: collectionPage.granted,
      collectionList: collectionList.data.some((c) => c.id === collection.id),
    }).toEqual({ page: collectionOpens, collectionList: collectionOpens });
  }, 30_000);
});

describe('the grant arm refuses to count every access type', () => {
  test('accessibleDatasetIdsByGrantsQuery throws without access types', () => {
    expect(() => grantService.accessibleDatasetIdsByGrantsQuery(viewer.subject_id)).toThrow(/access types/);
    expect(() => grantService.accessibleDatasetIdsByGrantsQuery(viewer.subject_id, [])).toThrow(/access types/);
  });
});
