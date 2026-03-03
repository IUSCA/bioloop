/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * collections.lifecycle.test.js
 *
 * Tests the full lifecycle of a collection: create, update metadata,
 * archive/unarchive, delete, and dataset membership operations.
 *
 * Note: updateCollectionMetadata increments the version field via OCC (version: { increment: 1 }).
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const collectionsService = require('@/services/collections');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestCollection,
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteCollection,
} = require('../helpers');

let actor;
let ownerGroup;
let foreignGroup;

// Datasets owned by ownerGroup
let dsA;
let dsB;
let dsC;
// Dataset owned by foreignGroup (cannot be added to a collection owned by ownerGroup)
let foreignDs;
// Dataset in ownerGroup that is soft-deleted
let deletedDs;

// Collections created per-test — cleaned up in afterAll
const collectionIds = [];
const datasetIds = [];
const groupIds = [];
const userIds = [];

beforeAll(async () => {
  actor = await createTestUser('_cl_actor');
  userIds.push(actor.id);

  ownerGroup = await createTestGroup(actor.subject_id, '_cl_owner');
  foreignGroup = await createTestGroup(actor.subject_id, '_cl_foreign');
  groupIds.push(ownerGroup.id, foreignGroup.id);

  [dsA, dsB, dsC] = await Promise.all([
    createTestDataset(ownerGroup.id, '_cl_a'),
    createTestDataset(ownerGroup.id, '_cl_b'),
    createTestDataset(ownerGroup.id, '_cl_c'),
  ]);
  foreignDs = await createTestDataset(foreignGroup.id, '_cl_fgn');
  deletedDs = await createTestDataset(ownerGroup.id, '_cl_del', { is_deleted: true });
  datasetIds.push(dsA.id, dsB.id, dsC.id, foreignDs.id, deletedDs.id);
}, 30_000);

afterAll(async () => {
  // delete collections first (FK: collection_dataset → collection)
  for (const id of collectionIds) await deleteCollection(id).catch(() => {});
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

async function newCollection(tag = '', overrides = {}) {
  const c = await createTestCollection(ownerGroup.id, actor.subject_id, tag, overrides);
  collectionIds.push(c.id);
  return c;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('collections - lifecycle', () => {
  describe('createCollection', () => {
    it('returns collection with correct owner_group_id', async () => {
      const c = await newCollection('_create');
      expect(c.owner_group_id).toBe(ownerGroup.id);
    });

    it('is_archived is false at creation', async () => {
      const c = await newCollection('_create_arch');
      expect(c.is_archived).toBe(false);
    });

    it('version is 1 at creation', async () => {
      const c = await newCollection('_create_v');
      expect(c.version).toBe(1);
    });

    it('slug is generated from name', async () => {
      const c = await newCollection('_create_slug');
      expect(c.slug).toBeTruthy();
      expect(c.slug).not.toMatch(/\s/);
    });

    it('creates a COLLECTION_CREATED audit row', async () => {
      const c = await newCollection('_create_audit');
      const audit = await prisma.authorization_audit.findFirst({
        where: {
          event_type: 'COLLECTION_CREATED',
          target_type: 'collection',
          target_id: String(c.id),
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('updateCollectionMetadata', () => {
    it('updates description with expected_version=1', async () => {
      const c = await newCollection('_upd');
      const updated = await collectionsService.updateCollectionMetadata(c.id, {
        data: { description: 'updated description' },
        expected_version: 1,
      });
      expect(updated.description).toBe('updated description');
    });

    it('name change regenerates slug', async () => {
      const c = await newCollection('_upd_slug');
      const newName = `Renamed ${Date.now()}`;
      const updated = await collectionsService.updateCollectionMetadata(c.id, {
        data: { name: newName },
        expected_version: 1,
      });
      expect(updated.name).toBe(newName);
      expect(updated.slug).not.toBe(c.slug);
    });

    it('throws 409 on archived collection regardless of version', async () => {
      const c = await newCollection('_upd_archived');
      await collectionsService.archiveCollection(c.id, actor.subject_id);
      await expect(
        collectionsService.updateCollectionMetadata(c.id, {
          data: { description: 'should fail' },
          expected_version: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('archiveCollection / unarchiveCollection', () => {
    it('archiveCollection sets is_archived=true and archived_at', async () => {
      const c = await newCollection('_archive');
      const archived = await collectionsService.archiveCollection(c.id, actor.subject_id);
      expect(archived.is_archived).toBe(true);
      expect(archived.archived_at).not.toBeNull();
    });

    it('unarchiveCollection sets is_archived=false and clears archived_at', async () => {
      const c = await newCollection('_unarchive');
      await collectionsService.archiveCollection(c.id, actor.subject_id);
      const restored = await collectionsService.unarchiveCollection(c.id, actor.subject_id);
      expect(restored.is_archived).toBe(false);
      expect(restored.archived_at).toBeNull();
    });
  });

  describe('deleteCollection', () => {
    it('deletes the collection row from the database', async () => {
      const c = await collectionsService.createCollection(
        {
          name: `Delete Me ${Date.now()}`,
          owner_group_id: ownerGroup.id,
        },
        { actor_id: actor.subject_id },
      );
      await collectionsService.deleteCollection(c.id, actor.subject_id);
      const row = await prisma.collection.findUnique({ where: { id: c.id } });
      expect(row).toBeNull();
    });
  });

  describe('addDatasets', () => {
    it('adds datasets and they appear in listDatasetsInCollection', async () => {
      const c = await newCollection('_add_ds');
      await collectionsService.addDatasets(c.id, {
        dataset_ids: [dsA.resource_id, dsB.resource_id],
        actor_id: actor.subject_id,
      });

      const result = await collectionsService.listDatasetsInCollection({
        collection_id: c.id, limit: 10, offset: 0, sort_by: 'id', sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(dsA.id);
      expect(ids).toContain(dsB.id);
    });

    it('rejects datasets from a different owner group (cross-group violation)', async () => {
      const c = await newCollection('_cross_group');
      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [foreignDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 400 });

      // No row must have been inserted
      const count = await prisma.collection_dataset.count({
        where: { collection_id: c.id, dataset_id: foreignDs.resource_id },
      });
      expect(count).toBe(0);
    });

    it('rejects soft-deleted datasets (is_deleted=true)', async () => {
      const c = await newCollection('_deleted_ds');
      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [deletedDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('is idempotent — adding the same dataset twice leaves exactly 1 row', async () => {
      const c = await newCollection('_idem_add');
      await collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id });
      await collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id });

      const count = await prisma.collection_dataset.count({
        where: { collection_id: c.id, dataset_id: dsA.resource_id },
      });
      expect(count).toBe(1);
    });
  });

  describe('removeDatasets', () => {
    it('removes a dataset from the collection', async () => {
      const c = await newCollection('_rm_ds');
      await collectionsService.addDatasets(c.id, {
        dataset_ids: [dsA.resource_id, dsB.resource_id],
        actor_id: actor.subject_id,
      });
      await collectionsService.removeDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id });

      const result = await collectionsService.listDatasetsInCollection({
        collection_id: c.id, limit: 10, offset: 0, sort_by: 'id', sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).not.toContain(dsA.id);
      expect(ids).toContain(dsB.id);
    });
  });

  describe('findCollectionsByDataset', () => {
    it('returns all collections containing the dataset', async () => {
      const c1 = await newCollection('_fbd_1');
      const c2 = await newCollection('_fbd_2');
      await collectionsService.addDatasets(c1.id, { dataset_ids: [dsC.resource_id], actor_id: actor.subject_id });
      await collectionsService.addDatasets(c2.id, { dataset_ids: [dsC.resource_id], actor_id: actor.subject_id });

      const result = await collectionsService.findCollectionsByDataset({
        dataset_id: dsC.resource_id, limit: 100, offset: 0, sort_by: 'created_at', sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);
    });

    it('returns pagination metadata with correct total', async () => {
      const c3 = await newCollection('_fbd_3');
      await collectionsService.addDatasets(c3.id, { dataset_ids: [dsC.resource_id], actor_id: actor.subject_id });

      const result = await collectionsService.findCollectionsByDataset({
        dataset_id: dsC.resource_id, limit: 100, offset: 0, sort_by: 'created_at', sort_order: 'desc',
      });
      expect(result.metadata.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('findCollectionsByOwnerGroup', () => {
    it('returns only collections owned by the specified group', async () => {
      const c = await newCollection('_by_group');

      const result = await collectionsService.findCollectionsByOwnerGroup({
        group_id: ownerGroup.id, limit: 100, offset: 0, sort_by: 'created_at', sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(c.id);

      // Collections from foreignGroup must NOT appear
      const foreignResult = await collectionsService.findCollectionsByOwnerGroup({
        group_id: foreignGroup.id, limit: 100, offset: 0, sort_by: 'created_at', sort_order: 'desc',
      });
      const foreignIds = foreignResult.data.map((r) => r.id);
      expect(foreignIds).not.toContain(c.id);
    });
  });

  describe('listDatasetsInCollection pagination', () => {
    it('respects limit and returns correct total', async () => {
      const c = await newCollection('_list_ds_pag');
      await collectionsService.addDatasets(c.id, {
        dataset_ids: [dsA.resource_id, dsB.resource_id, dsC.resource_id],
        actor_id: actor.subject_id,
      });

      const result = await collectionsService.listDatasetsInCollection({
        collection_id: c.id, limit: 2, offset: 0, sort_by: 'id', sort_order: 'desc',
      });
      expect(result.metadata.total).toBe(3);
      expect(result.data.length).toBe(2);
    });
  });

  describe('getCollectionById', () => {
    it('returns the correct collection', async () => {
      const c = await newCollection('_get_by_id');
      const fetched = await collectionsService.getCollectionById(c.id);
      expect(fetched.id).toBe(c.id);
      expect(fetched.owner_group_id).toBe(ownerGroup.id);
    });
  });
});
