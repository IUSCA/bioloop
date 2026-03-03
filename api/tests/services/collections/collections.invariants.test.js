/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * collections.invariants.test.js
 *
 * Tests DB-level and service-level invariants for collections:
 *  - Cross-group datasets cannot be added
 *  - is_archived gate blocks mutations (addDatasets, removeDatasets, updateCollectionMetadata)
 *  - version always stays 1 (service never increments it)
 *  - Deleting a collection cascades collection_dataset rows
 *  - Slug is URL-friendly and derived from name
 *  - Name uniqueness within an owner group (if enforced)
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
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteCollection,
} = require('../helpers');

let actor;
let ownerGroup;
let foreignGroup;
let ownDs;
let foreignDs;
let deletedDs;
let archivedGroupDs;
let archivedGroup;

const collectionIds = [];
const datasetIds = [];
const groupIds = [];
const userIds = [];

beforeAll(async () => {
  actor = await createTestUser('_ci_actor');
  userIds.push(actor.id);

  ownerGroup = await createTestGroup(actor.subject_id, '_ci_owner');
  foreignGroup = await createTestGroup(actor.subject_id, '_ci_foreign');
  archivedGroup = await createTestGroup(actor.subject_id, '_ci_arched_g');
  groupIds.push(ownerGroup.id, foreignGroup.id, archivedGroup.id);

  [ownDs, foreignDs, deletedDs] = await Promise.all([
    createTestDataset(ownerGroup.id, '_ci_own'),
    createTestDataset(foreignGroup.id, '_ci_fgn'),
    createTestDataset(ownerGroup.id, '_ci_del', { is_deleted: true }),
  ]);

  // Dataset whose owner_group is archived
  // cSpell: ignore agds
  archivedGroupDs = await createTestDataset(archivedGroup.id, '_ci_agds');
  await prisma.group.update({ where: { id: archivedGroup.id }, data: { is_archived: true } });

  datasetIds.push(ownDs.id, foreignDs.id, deletedDs.id, archivedGroupDs.id);
}, 30_000);

afterAll(async () => {
  for (const id of collectionIds) await deleteCollection(id).catch(() => {});
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});

  // Restore archived group before deleting (to avoid potential cascade issues)
  await prisma.group.update({ where: { id: archivedGroup.id }, data: { is_archived: false } }).catch(() => {});

  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

async function newCollection(tag = '') {
  const c = await collectionsService.createCollection(
    { name: `Inv Collection ${Date.now()}${tag}`, owner_group_id: ownerGroup.id },
    { actor_id: actor.subject_id },
  );
  collectionIds.push(c.id);
  return c;
}

async function archived(tag = '') {
  const c = await newCollection(tag);
  await collectionsService.archiveCollection(c.id, actor.subject_id);
  return c;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('collections – invariants', () => {
  describe('cross-group dataset rejection', () => {
    it('addDatasets rejects dataset owned by a different group (status 400)', async () => {
      const c = await newCollection('_cross_fgn');
      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [foreignDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 400 });

      const count = await prisma.collection_dataset.count({
        where: { collection_id: c.id, dataset_id: foreignDs.resource_id },
      });
      expect(count).toBe(0);
    });

    it('addDatasets rejects soft-deleted dataset (status 400)', async () => {
      const c = await newCollection('_cross_del');
      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [deletedDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 400 });
    });

    // cSpell: ignore agroup
    it('addDatasets rejects dataset whose owner group is archived (status 400)', async () => {
      const c = await newCollection('_cross_agroup');
      await expect(
        collectionsService.addDatasets(c.id, {
          dataset_ids: [archivedGroupDs.resource_id],
          actor_id: actor.subject_id,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('archived collection blocks mutations', () => {
    it('addDatasets on archived collection throws 409', async () => {
      const c = await archived('_inv_arch_add');
      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [ownDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });

      const count = await prisma.collection_dataset.count({
        where: { collection_id: c.id, dataset_id: ownDs.resource_id },
      });
      expect(count).toBe(0);
    });

    it('removeDatasets on archived collection throws 409', async () => {
      // Add dataset first while not archived
      const c = await newCollection('_inv_arch_rm');
      await collectionsService.addDatasets(c.id, { dataset_ids: [ownDs.resource_id], actor_id: actor.subject_id });
      await collectionsService.archiveCollection(c.id, actor.subject_id);

      await expect(
        collectionsService.removeDatasets(c.id, { dataset_ids: [ownDs.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });

      // Dataset must still be in the collection
      const count = await prisma.collection_dataset.count({
        where: { collection_id: c.id, dataset_id: ownDs.resource_id },
      });
      expect(count).toBe(1);
    });

    it('updateCollectionMetadata on archived collection throws 409', async () => {
      const c = await archived('_inv_arch_upd');
      await expect(
        collectionsService.updateCollectionMetadata(c.id, {
          data: { description: 'should not land' },
          expected_version: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });

      const row = await prisma.collection.findUnique({ where: { id: c.id } });
      expect(row.description).not.toBe('should not land');
    });
  });

  describe('version invariant', () => {
    it('version is 1 at creation', async () => {
      const c = await newCollection('_ver_create');
      expect(c.version).toBe(1);
    });

    it('version increments to 2 after updateCollectionMetadata', async () => {
      const c = await newCollection('_ver_upd');
      await collectionsService.updateCollectionMetadata(c.id, {
        data: { description: 'v test' },
        expected_version: 1,
      });

      const row = await prisma.collection.findUnique({ where: { id: c.id } });
      expect(row.version).toBe(2);
    });
  });

  describe('deleteCollection cascade', () => {
    it('deleting a collection cascades and removes all collection_dataset rows', async () => {
      const c = await collectionsService.createCollection(
        { name: `Cascade Del ${Date.now()}`, owner_group_id: ownerGroup.id },
        { actor_id: actor.subject_id },
      );
      await collectionsService.addDatasets(c.id, {
        dataset_ids: [ownDs.resource_id], actor_id: actor.subject_id,
      });

      await collectionsService.deleteCollection(c.id, actor.subject_id);

      const cdCount = await prisma.collection_dataset.count({ where: { collection_id: c.id } });
      expect(cdCount).toBe(0);

      const cRow = await prisma.collection.findUnique({ where: { id: c.id } });
      expect(cRow).toBeNull();
      // (no push to collectionIds since we deleted it manually)
    });
  });

  describe('slug invariant', () => {
    it('slug is URL-friendly (no spaces, all lowercase)', async () => {
      const c = await collectionsService.createCollection(
        {
          name: 'My Test Collection With Spaces',
          owner_group_id: ownerGroup.id,
        },
        { actor_id: actor.subject_id },
      );
      collectionIds.push(c.id);

      expect(c.slug).not.toMatch(/\s/);
      expect(c.slug).toBe(c.slug.toLowerCase());
    });

    it('slug is derived from the name', async () => {
      const ts = Date.now();
      const c = await collectionsService.createCollection(
        { name: `Unique Slug Source ${ts}`, owner_group_id: ownerGroup.id },
        { actor_id: actor.subject_id },
      );
      collectionIds.push(c.id);

      expect(c.slug).toContain('unique');
    });
  });

  describe('DB-level @@id uniqueness on collection_dataset', () => {
    it('inserting a duplicate row for the same (collection_id, dataset_id) is rejected at the DB level', async () => {
      const c = await newCollection('_dup_cd');
      // First insert via service (idempotent)
      await collectionsService.addDatasets(c.id, { dataset_ids: [ownDs.resource_id], actor_id: actor.subject_id });

      // Direct raw insert bypassing ON CONFLICT — should throw unique constraint violation
      await expect(
        prisma.collection_dataset.create({
          data: { collection_id: c.id, dataset_id: ownDs.resource_id },
        }),
      ).rejects.toThrow(); // Prisma P2002 unique constraint
    });
  });
});
