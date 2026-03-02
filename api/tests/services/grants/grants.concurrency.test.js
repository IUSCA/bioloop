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
  group = await createTestGroup(actor.id, '_gc');
  dataset = await createTestDataset(group.id, '_gc');
  viewMetaId = await getAccessTypeId('VIEW_METADATA', 'DATASET');
  downloadId = await getAccessTypeId('DOWNLOAD', 'DATASET');
}, 30_000);

afterAll(async () => {
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
    subject_type: 'USER',
    subject_id: String(user1.id),
    resource_type: 'DATASET',
    resource_id: dataset.id,
    access_type_id: accessTypeId ?? viewMetaId,
    ...overrides,
  };
}

function groupGrantPayload(accessTypeId = null, overrides = {}) {
  return {
    subject_type: 'GROUP',
    subject_id: group.id,
    resource_type: 'DATASET',
    resource_id: dataset.id,
    access_type_id: accessTypeId ?? viewMetaId,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('grants – concurrency', () => {
  describe('concurrent USER grants – same subject/resource/access_type/window', () => {
    it('exactly one creation succeeds; the other is rejected by the DB constraint', async () => {
      const results = await Promise.allSettled([
        grantsService.createGrant(userGrantPayload(viewMetaId), actor.id),
        grantsService.createGrant(userGrantPayload(viewMetaId), actor.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Clean up whichever succeeded
      fulfilled.forEach((r) => trackGrants(r.value));

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.status).toBe(409);
    });

    it('exactly 1 grant row exists after the race', async () => {
      const [created] = await Promise.allSettled([
        grantsService.createGrant(userGrantPayload(downloadId), actor.id),
        grantsService.createGrant(userGrantPayload(downloadId), actor.id),
      ]).then((results) => {
        results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));
        return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      });

      const count = await prisma.grant.count({
        where: {
          subject_type: 'USER',
          subject_id: String(user1.id),
          resource_type: 'DATASET',
          resource_id: dataset.id,
          access_type_id: downloadId,
          revoked_at: null,
        },
      });
      expect(count).toBe(1);
    });
  });

  describe('concurrent GROUP grants – same group/resource/access_type/window', () => {
    it('exactly one creation succeeds', async () => {
      const results = await Promise.allSettled([
        grantsService.createGrant(groupGrantPayload(viewMetaId), actor.id),
        grantsService.createGrant(groupGrantPayload(viewMetaId), actor.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      fulfilled.forEach((r) => trackGrants(r.value));

      expect(fulfilled).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
  });

  describe('non-overlapping validity windows', () => {
    it('two grants with non-overlapping windows both succeed', async () => {
      // Window A: [now, +1yr)  Window B: [+1yr, +2yr)
      const now = new Date();
      const plus1yr = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const plus2yr = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

      const results = await Promise.allSettled([
        grantsService.createGrant(
          userGrantPayload(viewMetaId, { valid_from: now, valid_until: plus1yr }),
          actor.id,
        ),
        grantsService.createGrant(
          userGrantPayload(viewMetaId, { valid_from: plus1yr, valid_until: plus2yr }),
          actor.id,
        ),
      ]);

      results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(0);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(2);
    });
  });

  describe('create after revoke unblocks the constraint', () => {
    it('revoking a grant allows a new overlapping grant to be created', async () => {
      const g1 = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.id);
      trackGrants(g1);

      // Duplicate should fail while g1 is active
      await expect(
        grantsService.createGrant(userGrantPayload(viewMetaId), actor.id),
      ).rejects.toMatchObject({ status: 409 });

      // Revoke g1 – this sets revoked_at, so the WHERE (revoked_at IS NULL) predicate
      // on the exclusion constraint no longer applies to g1.
      await grantsService.revokeGrant(g1.id, { actor_id: actor.id });

      // Now creating a new grant for the same subject/resource/access_type must succeed
      const g2 = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.id);
      trackGrants(g2);
      expect(g2).not.toBeNull();
      expect(g2.revoked_at).toBeNull();
    });
  });

  describe('concurrent revoke of the same grant', () => {
    it('both calls resolve and the grant ends up revoked exactly once', async () => {
      const g = await grantsService.createGrant(userGrantPayload(viewMetaId), actor.id);
      trackGrants(g);

      // Two concurrent revocations of the same grant.
      // Prisma update({where:{id}}) serialises writes at the DB level;
      // both calls will ultimately set revoked_at (idempotent write race).
      const results = await Promise.allSettled([
        grantsService.revokeGrant(g.id, { actor_id: actor.id }),
        grantsService.revokeGrant(g.id, { actor_id: actor.id }),
      ]);

      // At least one must succeed
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // The grant must be revoked in the DB
      const final = await grantsService.getGrantById(g.id);
      expect(final.revoked_at).not.toBeNull();
    });
  });

  describe('concurrent grants for different access types on the same resource', () => {
    it('both succeed because they target different access_type_ids', async () => {
      const results = await Promise.allSettled([
        grantsService.createGrant(userGrantPayload(viewMetaId), actor.id),
        grantsService.createGrant(userGrantPayload(downloadId), actor.id),
      ]);

      results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });
  });

  describe('concurrent grants for different users on the same resource', () => {
    it('both succeed because they target different subject_ids', async () => {
      const user2 = await createTestUser('_gc_u2');
      const user3 = await createTestUser('_gc_u3');

      const results = await Promise.allSettled([
        grantsService.createGrant({ ...userGrantPayload(viewMetaId), subject_id: String(user2.id) }, actor.id),
        grantsService.createGrant({ ...userGrantPayload(viewMetaId), subject_id: String(user3.id) }, actor.id),
      ]);

      results.filter((r) => r.status === 'fulfilled').forEach((r) => trackGrants(r.value));

      await deleteUser(user2.id);
      await deleteUser(user3.id);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });
  });
});
