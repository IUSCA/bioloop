/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/**
 * collections.concurrency.test.js
 *
 * Tests concurrent access patterns for the collections service:
 *  - Concurrent updateCollectionMetadata (both succeed because version never increments)
 *  - Concurrent addDatasets / removeDatasets (serialized by FOR UPDATE)
 *  - Archive vs addDatasets race (exactly one wins)
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const collectionsService = require('@/services/collections');
const { runRace, fanOut } = require('../concurrency-utils');
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
let dsA;
let dsB;

const collectionIds = [];
const datasetIds = [];
const groupIds = [];
const userIds = [];

beforeAll(async () => {
  actor = await createTestUser('_cc_actor');
  userIds.push(actor.id);

  ownerGroup = await createTestGroup(actor.subject_id, '_cc_owner');
  groupIds.push(ownerGroup.id);

  [dsA, dsB] = await Promise.all([
    createTestDataset(ownerGroup.id, '_cc_a'),
    createTestDataset(ownerGroup.id, '_cc_b'),
  ]);
  datasetIds.push(dsA.id, dsB.id);
}, 30_000);

afterAll(async () => {
  for (const id of collectionIds) await deleteCollection(id).catch(() => {});
  for (const id of datasetIds) await deleteDataset(id).catch(() => {});
  for (const id of groupIds) await deleteGroup(id).catch(() => {});
  for (const id of userIds) await deleteUser(id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────

async function freshCollection(tag = '') {
  const c = await collectionsService.createCollection(
    { name: `Conc Collection ${Date.now()}${tag}`, owner_group_id: ownerGroup.id },
    { actor_id: actor.subject_id },
  );
  collectionIds.push(c.id);
  return c;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('collections - concurrency', () => {
  describe('concurrent updateCollectionMetadata', () => {
    /**
     * updateCollectionMetadata increments the version field via `version: { increment: 1 }`.
     * Multiple concurrent calls with the same expected_version will race on the DB row;
     * exactly one wins (version becomes 2) and the others get 409 (P2025 record not found).
     */
    it('exactly 1 succeeds; the other receives 409', async () => {
      await runRace(
        async () => freshCollection('_upd_conc'),
        (c) => fanOut(5, () => collectionsService.updateCollectionMetadata(c.id, {
          data: { description: 'update' },
          expected_version: 1,
        })),
        async (results, c) => {
          const succeeded = results.filter((r) => r.status === 'fulfilled');
          const failed = results.filter((r) => r.status === 'rejected');

          expect(succeeded).toHaveLength(1);
          expect(failed).toHaveLength(4);
          failed.forEach((r) => {
            expect(r.reason).toMatchObject({ status: 409 });
          });

          // Final version is 2 (exactly one increment)
          const final = await prisma.collection.findUnique({ where: { id: c.id } });
          expect(final.version).toBe(2);
        },
      );
    });

    it('two sequential updates with correct versions both succeed (version reaches 3)', async () => {
      const c = await freshCollection('_upd_seq');

      await collectionsService.updateCollectionMetadata(c.id, {
        data: { description: 'first' },
        expected_version: 1,
      });
      await expect(
        collectionsService.updateCollectionMetadata(c.id, {
          data: { description: 'second' },
          expected_version: 2, // version is now 2 after first update
        }),
      ).resolves.toMatchObject({ description: 'second' });

      const final = await prisma.collection.findUnique({ where: { id: c.id } });
      expect(final.description).toBe('second');
      expect(final.version).toBe(3);
    });

    it('stale version throws 409', async () => {
      const c = await freshCollection('_upd_stale');

      await collectionsService.updateCollectionMetadata(c.id, {
        data: { description: 'bump version' },
        expected_version: 1,
      });

      await expect(
        collectionsService.updateCollectionMetadata(c.id, {
          data: { description: 'should fail' },
          expected_version: 1, // stale — version is now 2
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('concurrent addDatasets', () => {
    it('two concurrent adds of the same dataset result in exactly 1 row', async () => {
      await runRace(
        async () => freshCollection('_add_conc'),
        (c) => fanOut(5, () => collectionsService.addDatasets(c.id, {
          dataset_ids: [dsA.resource_id],
          actor_id: actor.subject_id,
        })),
        async (results, c) => {
          // All serialized by FOR UPDATE — all should resolve
          results.forEach((r) => {
            expect(r.status).toBe('fulfilled');
          });

          const count = await prisma.collection_dataset.count({
            where: { collection_id: c.id, dataset_id: dsA.resource_id },
          });
          expect(count).toBe(1);
        },
      );
    });

    it('concurrent adds of different datasets both succeed', async () => {
      await runRace(
        async () => freshCollection('_add_diff'),
        (c) => [
          collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id }),
          collectionsService.addDatasets(c.id, { dataset_ids: [dsB.resource_id], actor_id: actor.subject_id }),
        ],
        async (results, c) => {
          const count = await prisma.collection_dataset.count({ where: { collection_id: c.id } });
          expect(count).toBe(2);
        },
      );
    });
  });

  describe('concurrent removeDatasets', () => {
    it('two concurrent removes of the same dataset both resolve with 0 rows remaining', async () => {
      await runRace(
        async () => {
          const c = await freshCollection('_rm_conc');
          await collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id });
          return c;
        },
        (c) => fanOut(5, () => collectionsService.removeDatasets(c.id, {
          dataset_ids: [dsA.resource_id],
          actor_id: actor.subject_id,
        })),
        async (results, c) => {
          results.forEach((r) => {
            expect(r.status).toBe('fulfilled');
          });

          const count = await prisma.collection_dataset.count({
            where: { collection_id: c.id, dataset_id: dsA.resource_id },
          });
          expect(count).toBe(0);
        },
      );
    });

    it('remove on already-empty collection resolves without error', async () => {
      const c = await freshCollection('_rm_empty');
      await expect(
        collectionsService.removeDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id }),
      ).resolves.not.toThrow();
    });
  });

  describe('archiveCollection vs addDatasets race', () => {
    /**
     * addDatasets acquires FOR UPDATE on the collection row, then checks is_archived.
     * archiveCollection issues a plain UPDATE. The two operations serialize on the
     * collection row. One of the following will happen:
     *   - archiveCollection wins → addDatasets sees is_archived=true → throws 409
     *   - addDatasets wins → datasets inserted; archiveCollection completes after
     *
     * Either way the collection ends up archived and its final state is consistent.
     */
    it('collection is archived after the race regardless of ordering', async () => {
      await runRace(
        async () => freshCollection('_arch_race'),
        (c) => [
          collectionsService.archiveCollection(c.id, actor.subject_id),
          collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id }),
        ],
        async (results, c) => {
          // At least one operation succeeded
          const succeeded = results.filter((r) => r.status === 'fulfilled');
          expect(succeeded.length).toBeGreaterThanOrEqual(1);

          // The collection must always end up archived
          const final = await prisma.collection.findUnique({ where: { id: c.id } });
          expect(final.is_archived).toBe(true);
        },
      );
    });

    it('addDatasets on already-archived collection throws 409', async () => {
      const c = await freshCollection('_arch_add');
      await collectionsService.archiveCollection(c.id, actor.subject_id);

      await expect(
        collectionsService.addDatasets(c.id, { dataset_ids: [dsA.resource_id], actor_id: actor.subject_id }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });
});
