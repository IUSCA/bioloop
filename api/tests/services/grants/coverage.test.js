/* eslint-disable no-await-in-loop */
/**
 * coverage.test.js
 *
 * getEffectiveCoverage answers which live grants reach a subject on a resource, through every
 * path, and says how each one arrives.
 *
 * The point of the function is the paths the exact-subject queries miss. A user inheriting
 * from their group, a group inheriting from its ancestor, and a dataset reached through a
 * collection are each asserted here, because the requester's and the reviewer's previews
 * read this function and would otherwise miss each one.
 *
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { getEffectiveCoverage, labelCoverage } = require('@/services/grants');
const { AUTHENTICATED_USERS_GROUP_ID } = require('@/constants');
const {
  createTestUser, createTestGroup, createTestChildGroup, createTestDataset,
  createTestCollection, createTestGrant, getAccessTypeId,
  deleteUser, deleteGroup, deleteDataset, deleteCollection,
  deleteGrants, deleteGrantsForResource,
} = require('../helpers');

let actor;
let member;
let outsider;
let parentGroup;
let childGroup;
let dataset;
let collection;
let downloadId;
let listContentsId;

const createdGrantIds = [];

const grant = async (subject_id, resource_id, access_type_id) => {
  const row = await createTestGrant({
    subject_id, resource_id, access_type_id, granted_by: actor.subject_id,
  });
  createdGrantIds.push(row.id);
  return row;
};

const coverageOf = (subject_id, resource_id, resource_type = 'DATASET') => getEffectiveCoverage({
  subject_id, resource_id, resource_type,
});

beforeAll(async () => {
  actor = await createTestUser('_cov_actor');
  member = await createTestUser('_cov_member');
  outsider = await createTestUser('_cov_outsider');

  parentGroup = await createTestGroup(actor.subject_id, '_cov_parent');
  childGroup = await createTestChildGroup(parentGroup.id, actor.subject_id, '_cov_child');

  dataset = await createTestDataset(childGroup.id, '_cov_dataset');
  collection = await createTestCollection(childGroup.id, actor.subject_id, '_cov_collection');

  // Creating a dataset and a collection seeds an owning-group grant, which would show up as
  // coverage and drown the assertions below.
  await deleteGrantsForResource(dataset.resource_id);
  await deleteGrantsForResource(collection.id);

  // member belongs to the child group only; effective_user_groups adds the parent.
  await prisma.group_user.createMany({
    data: [{ group_id: childGroup.id, user_id: member.subject_id, role: 'MEMBER' }],
    skipDuplicates: true,
  });

  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
  listContentsId = await getAccessTypeId('COLLECTION:LIST_CONTENTS');
}, 30000);

afterEach(async () => {
  await deleteGrants(createdGrantIds);
  createdGrantIds.length = 0;
});

afterAll(async () => {
  await prisma.group_user.deleteMany({ where: { user_id: member.subject_id } });
  await prisma.collection_dataset.deleteMany({ where: { dataset_id: dataset.resource_id } });
  await deleteGrantsForResource(dataset.resource_id);
  await deleteGrantsForResource(collection.id);
  await deleteCollection(collection.id);
  await deleteDataset(dataset.id);
  await deleteGroup(childGroup.id);
  await deleteGroup(parentGroup.id);
  await deleteUser(actor.id);
  await deleteUser(member.id);
  await deleteUser(outsider.id);
  await prisma.$disconnect();
});

describe('coverage a subject holds itself', () => {
  test('a grant on the subject is reported as DIRECT with no via group', async () => {
    const row = await grant(member.subject_id, dataset.resource_id, downloadId);

    const coverage = await coverageOf(member.subject_id, dataset.resource_id);

    expect(coverage).toHaveLength(1);
    expect(coverage[0].id).toBe(row.id);
    expect(coverage[0].via).toBe('DIRECT');
    expect(coverage[0].via_group_id).toBeNull();
    expect(coverage[0].access_type_name).toBe('DATASET:DOWNLOAD');
  });

  test('a revoked grant reaches nobody', async () => {
    const row = await createTestGrant({
      subject_id: member.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: downloadId,
      granted_by: actor.subject_id,
      revoked_at: new Date(),
    });
    createdGrantIds.push(row.id);

    expect(await coverageOf(member.subject_id, dataset.resource_id)).toEqual([]);
  });
});

describe('coverage a subject inherits', () => {
  // This is the case both previews used to hide. A reviewer would have been shown "1 new
  // grant" for access the requester's group already confers.
  test('a user inherits a grant held by a group they belong to', async () => {
    await grant(childGroup.id, dataset.resource_id, downloadId);

    const coverage = await coverageOf(member.subject_id, dataset.resource_id);

    expect(coverage).toHaveLength(1);
    expect(coverage[0].via).toBe('GROUP');
    expect(coverage[0].via_group_id).toBe(childGroup.id);
  });

  test('a user inherits a grant held by an ancestor of their group', async () => {
    await grant(parentGroup.id, dataset.resource_id, downloadId);

    const coverage = await coverageOf(member.subject_id, dataset.resource_id);

    expect(coverage.map((c) => c.via_group_id)).toEqual([parentGroup.id]);
  });

  test('a group subject inherits a grant held by its ancestor', async () => {
    await grant(parentGroup.id, dataset.resource_id, downloadId);

    const coverage = await coverageOf(childGroup.id, dataset.resource_id);

    expect(coverage).toHaveLength(1);
    expect(coverage[0].via).toBe('GROUP');
    expect(coverage[0].via_group_id).toBe(parentGroup.id);
  });

  test('a grant to a system principal reaches any subject', async () => {
    await grant(AUTHENTICATED_USERS_GROUP_ID, dataset.resource_id, downloadId);

    const coverage = await coverageOf(outsider.subject_id, dataset.resource_id);

    expect(coverage).toHaveLength(1);
    expect(coverage[0].via).toBe('PRINCIPAL');
  });

  test('someone outside the group inherits nothing from it', async () => {
    await grant(childGroup.id, dataset.resource_id, downloadId);

    expect(await coverageOf(outsider.subject_id, dataset.resource_id)).toEqual([]);
  });
});

describe('coverage that arrives through a collection', () => {
  beforeEach(async () => {
    await prisma.collection_dataset.createMany({
      data: [{ collection_id: collection.id, dataset_id: dataset.resource_id }],
      skipDuplicates: true,
    });
  });

  afterEach(async () => {
    await prisma.collection_dataset.deleteMany({ where: { dataset_id: dataset.resource_id } });
  });

  test('a dataset access type granted on a collection covers the datasets it holds', async () => {
    await grant(member.subject_id, collection.id, downloadId);

    const coverage = await coverageOf(member.subject_id, dataset.resource_id);

    expect(coverage).toHaveLength(1);
    expect(coverage[0].via_collection_id).toBe(collection.id);
  });

  test('a collection access type covers no dataset in the collection', async () => {
    // The engine never honours a collection type on a dataset, so coverage must not report it.
    // @see docs/contributing/techniques/authorization-engine.md — A list query widens through the access-type order
    await grant(member.subject_id, collection.id, listContentsId);

    expect(await coverageOf(member.subject_id, dataset.resource_id)).toEqual([]);
  });

  test('a collection is covered only by grants on itself', async () => {
    // The relationship does not run the other way: holding the dataset confers nothing on
    // the collection that contains it.
    await grant(member.subject_id, dataset.resource_id, downloadId);

    const coverage = await coverageOf(member.subject_id, collection.id, 'COLLECTION');

    expect(coverage).toEqual([]);
  });
});

describe('labelling', () => {
  test('names the group and the collection a grant arrives through', async () => {
    await prisma.collection_dataset.createMany({
      data: [{ collection_id: collection.id, dataset_id: dataset.resource_id }],
      skipDuplicates: true,
    });
    await grant(childGroup.id, collection.id, downloadId);

    const [row] = await labelCoverage(await coverageOf(member.subject_id, dataset.resource_id));

    expect(row.via_group_name).toBe(childGroup.name);
    expect(row.via_collection_name).toBe(collection.name);

    await prisma.collection_dataset.deleteMany({ where: { dataset_id: dataset.resource_id } });
  });

  test('leaves a direct grant unlabelled', async () => {
    await grant(member.subject_id, dataset.resource_id, downloadId);

    const [row] = await labelCoverage(await coverageOf(member.subject_id, dataset.resource_id));

    expect(row.via_group_name ?? null).toBeNull();
    expect(row.via_collection_name ?? null).toBeNull();
  });
});
