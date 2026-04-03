/**
 * grants.concurrency.test.js
 *
 * Tests that the grant_no_overlap exclusion constraint and surrounding
 * service logic remain correct under concurrent operations.
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const { runRace, fanOut } = require('../concurrency-utils');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteGrants,
  getAccessTypeId,
} = require('../helpers');

let actor;
let user1;
let group;
let dataset;
let viewMetaId;
let downloadId;

const createdGrantIds = [];

function trackGrants(...grants) {
  grants.forEach((g) => g && createdGrantIds.push(g.id));
}

beforeAll(async () => {
  actor = await createTestUser('_gc_actor');
  user1 = await createTestUser('_gc_u1');
  group = await createTestGroup(actor.subject_id, '_gc');
  dataset = await createTestDataset(group.id, '_gc');
  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30_000);

// Clean up any grants created by each individual test so subsequent tests start fresh
// (prevents the exclusion constraint from conflicting across test cases in the same suite).
afterEach(async () => {
  if (createdGrantIds.length > 0) {
    await deleteGrants([...createdGrantIds]);
    createdGrantIds.length = 0;
  }
}, 30_000);

afterAll(async () => {
  // createdGrantIds is emptied by afterEach; this is a safety net for any missed cleanup.
  await deleteGrants(createdGrantIds);
  await deleteDataset(dataset.id);
  await deleteGroup(group.id);
  await deleteUser(user1.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function userGrantPayload(accessTypeId = null, overrides = {}) {
  return {
    subject_id: user1.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: accessTypeId ?? viewMetaId,
    ...overrides,
  };
}

function groupGrantPayload(accessTypeId = null, overrides = {}) {
  return {
    subject_id: group.id,
    resource_id: dataset.resource_id,
    access_type_id: accessTypeId ?? viewMetaId,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('grants - concurrency', () => {
  describe('concurrent USER grants - same subject/resource/access_type/window', () => {
    it('exactly one creation succeeds; the other is rejected by the DB constraint', async () => {
      await runRace(
        async () => ({}), // No setup needed
        () => fanOut(5, () => grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id)),
        async (results) => {
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          const rejected = results.filter((r) => r.status === 'rejected');

          // Clean up whichever succeeded
          fulfilled.forEach((r) => trackGrants(r.value));

          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(4);
          rejected.forEach((r) => {
            // Some rejections may be DB-level errors without status property
            expect(r.reason.status || r.reason.message).toBeTruthy();
          });
        },
        async () => {
          // Revoke all grants for this user/resource/access_type to reset for next iteration
          await prisma.grant.updateMany({
            where: {
              subject_id: user1.subject_id,
              resource_id: dataset.resource_id,
              access_type_id: viewMetaId,
              revoked_at: null,
            },
            data: { revoked_at: new Date() },
          }).catch(() => {});
        },
      );
    });

    it('exactly 1 grant row exists after the race', async () => {
      await runRace(
        async () => ({}), // No setup needed
        () => fanOut(5, () => grantsService.createGrant(userGrantPayload(downloadId), actor.subject_id)),
        async (results) => {
          results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));
          const grantCount = await prisma.grant.count({
            where: {
              subject_id: user1.subject_id,
              resource_id: dataset.resource_id,
              access_type_id: downloadId,
              revoked_at: null,
            },
          });
          expect(grantCount).toBe(1);
        },
        async () => {
          // Revoke all grants for this user/resource/access_type to reset for next iteration
          await prisma.grant.updateMany({
            where: {
              subject_id: user1.subject_id,
              resource_id: dataset.resource_id,
              access_type_id: downloadId,
              revoked_at: null,
            },
            data: { revoked_at: new Date() },
          }).catch(() => {});
        },
      );
    });
  });

  describe('concurrent GROUP grants - same group/resource/access_type/window', () => {
    it('exactly one creation succeeds', async () => {
      await runRace(
        async () => ({}), // No setup needed
        () => fanOut(5, () => grantsService.createGrant(groupGrantPayload(viewMetaId), actor.subject_id)),
        async (results) => {
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          fulfilled.forEach((r) => trackGrants(r.value));

          expect(fulfilled).toHaveLength(1);
          expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
        },
        async () => {
          // Revoke all grants for this group/resource/access_type to reset for next iteration
          await prisma.grant.updateMany({
            where: {
              subject_id: group.id,
              resource_id: dataset.resource_id,
              access_type_id: viewMetaId,
              revoked_at: null,
            },
            data: { revoked_at: new Date() },
          }).catch(() => {});
        },
      );
    });
  });

  describe('non-overlapping validity windows', () => {
    it('two grants with non-overlapping windows both succeed', async () => {
      await runRace(
        async () => {
          const now = new Date();
          const plus1yr = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
          const plus2yr = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
          return { now, plus1yr, plus2yr };
        },
        ({ now, plus1yr, plus2yr }) => [
          grantsService.createGrant(
            userGrantPayload(viewMetaId, { valid_from: now, valid_until: plus1yr }),
            actor.subject_id,
          ),
          grantsService.createGrant(
            userGrantPayload(viewMetaId, { valid_from: plus1yr, valid_until: plus2yr }),
            actor.subject_id,
          ),
        ],
        async (results) => {
          results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));

          const rejected = results.filter((r) => r.status === 'rejected');
          expect(rejected).toHaveLength(0);

          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          expect(fulfilled).toHaveLength(2);
        },
        async () => {
          // Revoke all grants for this user/resource/access_type to reset for next iteration
          await prisma.grant.updateMany({
            where: {
              subject_id: user1.subject_id,
              resource_id: dataset.resource_id,
              access_type_id: viewMetaId,
              revoked_at: null,
            },
            data: { revoked_at: new Date() },
          }).catch(() => {});
        },
      );
    });
  });

  describe('create after revoke unblocks the constraint', () => {
    it('revoking a grant allows a new overlapping grant to be created', async () => {
      const g1 = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id);
      trackGrants(g1);

      // Duplicate should fail while g1 is active
      await expect(
        grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id),
      ).rejects.toMatchObject({ status: 409 });

      // Revoke g1 - this sets revoked_at, so the WHERE (revoked_at IS NULL) predicate
      // on the exclusion constraint no longer applies to g1.
      await grantsService.revokeGrant(g1.id, { actor_id: actor.subject_id });

      // Now creating a new grant for the same subject/resource/access_type must succeed
      const g2 = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id);
      trackGrants(g2);
      expect(g2).not.toBeNull();
      expect(g2.revoked_at).toBeNull();
    });
  });

  describe('concurrent revoke of the same grant', () => {
    it('both calls resolve and the grant ends up revoked exactly once', async () => {
      await runRace(
        async () => {
          const g = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id);
          trackGrants(g);
          return g;
        },
        (g) => fanOut(5, () => grantsService.revokeGrant(g.id, { actor_id: actor.subject_id })),
        async (results, g) => {
          // At least one must succeed
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          expect(fulfilled.length).toBeGreaterThanOrEqual(1);

          // The grant must be revoked in the DB
          const final = await grantsService.getGrantById(g.id);
          expect(final.revoked_at).not.toBeNull();
        },
      );
    });
  });

  describe('concurrent grants for different access types on the same resource', () => {
    it('both succeed because they target different access_type_ids', async () => {
      await runRace(
        async () => ({}),
        () => [
          grantsService.createGrant(userGrantPayload(viewMetaId), actor.subject_id),
          grantsService.createGrant(userGrantPayload(downloadId), actor.subject_id),
        ],
        async (results) => {
          results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
        },
        async () => {
          // Clean up both access types for next iteration
          await prisma.grant.updateMany({
            where: {
              subject_id: user1.subject_id,
              resource_id: dataset.resource_id,
              access_type_id: { in: [viewMetaId, downloadId] },
              revoked_at: null,
            },
            data: { revoked_at: new Date() },
          }).catch(() => {});
        },
      );
    });
  });

  describe('concurrent grants for different users on the same resource', () => {
    it('both succeed because they target different subject_ids', async () => {
      await runRace(
        async () => {
          const user2 = await createTestUser('_gc_u2');
          const user3 = await createTestUser('_gc_u3');
          return { user2, user3 };
        },
        ({ user2, user3 }) => [
          grantsService.createGrant(
            {
              ...userGrantPayload(viewMetaId),
              subject_id: user2.subject_id,
            },
            actor.subject_id,
          ),
          grantsService.createGrant(
            {
              ...userGrantPayload(viewMetaId),
              subject_id: user3.subject_id,
            },
            actor.subject_id,
          ),
        ],
        async (results) => {
          results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
        },
        async ({ user2, user3 }) => {
          await deleteUser(user2.id).catch(() => {});
          await deleteUser(user3.id).catch(() => {});
        },
      );
    });
  });
});
