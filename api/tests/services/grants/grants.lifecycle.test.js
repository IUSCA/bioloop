/* eslint-disable no-await-in-loop */
/**
 * grants.lifecycle.test.js
 *
 * Tests that a grant can be created, read, listed, and revoked correctly.
 * Covers USER grants, GROUP grants, time-bounded grants, and the
 * derived-query helpers (getGrantAccessTypesForUser, userHasGrant).
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const auditService = require('@/services/audit');
const grantsService = require('@/services/grants');
const { addGroupMembers } = require('@/services/groups');
const { TARGET_TYPE, AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit');
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

// ─────────────────────────────────────────────
// Shared fixtures (created once for the whole suite)
// ─────────────────────────────────────────────

let actor; // user who creates/revokes grants
let member; // user who receives USER grants
let group; // group with `member` as a member
let dataset; // dataset owned by `group`
let viewMetaId; // grant_access_type id for VIEW_METADATA / DATASET
let downloadId; // grant_access_type id for DOWNLOAD / DATASET

// Track created grant IDs so afterAll can clean up reliably.
const createdGrantIds = [];

beforeAll(async () => {
  actor = await createTestUser('_gl_actor');
  member = await createTestUser('_gl_member');
  group = await createTestGroup(actor.subject_id, '_gl');
  // make `member` a member of the group
  await addGroupMembers(group.id, { user_ids: [member.subject_id], actor_id: actor.subject_id });
  dataset = await createTestDataset(group.id, '_gl');
  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
  downloadId = await getAccessTypeId('DATASET:DOWNLOAD');
}, 30_000);

afterAll(async () => {
  await deleteGrants(createdGrantIds);
  await deleteDataset(dataset.id);
  await deleteGroup(group.id);
  await deleteUser(member.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// async function countActiveGrants() {
//   const rows = await prisma.$queryRaw`
//     SELECT COUNT(*) FROM valid_grants
//   `;
//   return rows[0].count;
// }

async function makeUserGrant(overrides = {}) {
  const grant = await grantsService.createGrant(
    {
      subject_id: member.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: viewMetaId,
      ...overrides,
    },
    actor.subject_id,
  );
  createdGrantIds.push(grant.id);
  return grant;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('grants - lifecycle', () => {
  describe('createGrant - USER', () => {
    let grant;

    beforeAll(async () => {
      grant = await makeUserGrant();
    });

    it('returns subject_id equal to member.subject_id', () => {
      expect(grant.subject_id).toBe(member.subject_id);
    });

    it('is not revoked at creation time', () => {
      expect(grant.revoked_at).toBeNull();
    });

    it('valid_from is in the past or at most a few seconds in the future', () => {
      const delta = Date.now() - new Date(grant.valid_from).getTime();
      expect(delta).toBeGreaterThanOrEqual(-2000); // allow 2 s clock skew
    });

    it('has valid_until = null when not specified', () => {
      expect(grant.valid_until).toBeNull();
    });

    it('creates a GRANT_CREATED audit row with subject/resource metadata', async () => {
      const auditRow = await prisma.authorization_audit.findFirst({
        where: { event_type: AUTH_EVENT_TYPE.GRANT_CREATED, target_type: TARGET_TYPE.GRANT, target_id: grant.id },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow.actor_id).toBe(actor.subject_id);
      expect(auditRow.subject_id).toBe(member.subject_id);
      expect(auditRow.subject_type).toBe('USER');
      expect(auditRow.resource_id).toBe(dataset.resource_id);
      expect(auditRow.resource_type).toBe('DATASET');
      expect(auditRow.resource_name).toBe(dataset.name);
      expect(auditRow.metadata?.access_type_name).toBe('DATASET:VIEW_METADATA');
    });

    it('allows filtering audit by resource (metadata-based)', async () => {
      const entries = await auditService.getAuditRecords({
        filter: {
          resource_id: dataset.resource_id,
          resource_type: 'DATASET',
          event_type: AUTH_EVENT_TYPE.GRANT_CREATED,
        },
        limit: 10,
        offset: 0,
      });
      expect(entries.length).toBeGreaterThan(0);
    });

    afterAll(async () => {
      // Revoke the USER grant so subsequent describe blocks can create their own non-overlapping grants
      if (grant) await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
    });
  });

  describe('createGrant - GROUP', () => {
    let grant;

    beforeAll(async () => {
      grant = await grantsService.createGrant(
        {
          subject_id: group.id,
          resource_id: dataset.resource_id,
          access_type_id: downloadId,
        },
        actor.subject_id,
      );
      createdGrantIds.push(grant.id);
    });

    it('returns subject_id equal to group.id', () => {
      expect(grant.subject_id).toBe(group.id);
    });

    afterAll(async () => {
      // Revoke the GROUP grant so subsequent describe blocks can create their own non-overlapping grants
      if (grant) await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
    });
  });

  describe('getGrantById', () => {
    let grant;
    beforeAll(async () => {
      grant = await makeUserGrant({ access_type_id: downloadId });
    });

    it('returns the grant with correct fields', async () => {
      const fetched = await grantsService.getGrantById(grant.id);
      expect(fetched).not.toBeNull();
      expect(fetched.id).toBe(grant.id);
      expect(fetched.resource_id).toBe(dataset.resource_id);
    });

    it('returns null for an unknown id', async () => {
      const result = await grantsService.getGrantById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    afterAll(async () => {
      // Revoke immediately so the active downloadId grant does not conflict with later tests
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
    });
  });

  describe('revokeGrant', () => {
    let grant;

    beforeAll(async () => {
      grant = await makeUserGrant({ access_type_id: viewMetaId });
      grant = await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id, reason: 'test revoke' });
    });

    it('sets revoked_at', () => {
      expect(grant.revoked_at).not.toBeNull();
    });

    it('sets revoked_by to the actor', () => {
      expect(grant.revoked_by).toBe(actor.subject_id);
    });

    it('creates a GRANT_REVOKED audit row', async () => {
      const auditRow = await prisma.authorization_audit.findFirst({
        where: { event_type: AUTH_EVENT_TYPE.GRANT_REVOKED, target_type: TARGET_TYPE.GRANT, target_id: grant.id },
      });
      expect(auditRow).not.toBeNull();
    });
  });

  describe('userHasGrant - direct USER grant', () => {
    let grant;

    beforeAll(async () => {
      grant = await makeUserGrant({ access_type_id: viewMetaId });
    });

    it('returns true when a valid grant exists', async () => {
      const has = await grantsService.userHasGrant({
        user_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(true);
    });

    it('returns false after the grant is revoked', async () => {
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
      const has = await grantsService.userHasGrant({
        user_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(false);
    });

    afterAll(async () => {
      // Revoke the USER grant so subsequent describe blocks can create their own non-overlapping grants
      if (grant) {
        try {
          await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
        } catch (error) {
          // NotFoundError: Grant not found or already revoked
          if (error.name !== 'NotFoundError') {
            throw error;
          }
        }
      }
    });
  });

  describe('userHasGrant - via GROUP grant', () => {
    let grant;

    beforeAll(async () => {
      // `member` is in `group`; a GROUP grant on the dataset should give member access
      grant = await grantsService.createGrant(
        {
          subject_id: group.id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetaId,
        },
        actor.subject_id,
      );
      createdGrantIds.push(grant.id);
    });

    it('member inherits access via group membership', async () => {
      const has = await grantsService.userHasGrant({
        user_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(true);
    });

    it('a user not in the group does NOT get access', async () => {
      const outsider = await createTestUser('_gl_outsider');
      const has = await grantsService.userHasGrant({
        user_id: outsider.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      await deleteUser(outsider.id);
      expect(has).toBe(false);
    });

    afterAll(async () => {
      // Revoke the GROUP grant so subsequent describe blocks can create their own non-overlapping grants
      if (grant) await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
    });
  });

  describe('getGrantAccessTypesForUser', () => {
    let grant;

    beforeAll(async () => {
      grant = await makeUserGrant({ access_type_id: viewMetaId });
    });

    it('returns a Set containing the granted access-type name', async () => {
      const types = await grantsService.getGrantAccessTypesForUser(
        member.subject_id,
        dataset.resource_id,
        'DATASET',
      );
      expect(types).toBeInstanceOf(Set);
      expect(types.has('DATASET:VIEW_METADATA')).toBe(true);
    });

    it('returns an empty Set after revocation', async () => {
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
      const types = await grantsService.getGrantAccessTypesForUser(
        member.subject_id,
        dataset.resource_id,
        'DATASET',
      );
      expect(types.size).toBe(0);
    });
  });

  describe('time-bounded grants', () => {
    it('a grant with valid_until in the future is considered active', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
      const grant = await makeUserGrant({
        access_type_id: viewMetaId,
        valid_until: futureDate,
      });
      const has = await grantsService.userHasGrant({
        user_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      // clean up before asserting so the grant does not interfere with other tests
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
      expect(has).toBe(true);
    });

    it('a grant with valid_until in the past is NOT considered active', async () => {
      // Insert directly so we can set a past valid_until without hitting the overlap constraint
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // -1 hour
      const pastFrom = new Date(Date.now() - 2 * 60 * 60 * 1000); // -2 hours

      const row = await prisma.grant.create({
        data: {
          subject_id: member.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetaId,
          valid_from: pastFrom,
          valid_until: pastDate,
          granted_by: actor.subject_id,
          creation_type: 'MANUAL',
        },
      });
      createdGrantIds.push(row.id);

      const has = await grantsService.userHasGrant({
        user_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(false);
    });
  });

  describe('listGrantsForSubject', () => {
    const localGrantIds = [];

    beforeAll(async () => {
      for (let i = 0; i < 3; i += 1) {
        // Vary the access_type so each grant has a distinct validity window
        const atId = [viewMetaId, downloadId, viewMetaId][i];
        const fromOffset = i * 365 * 24 * 60 * 60 * 1000; // non-overlapping years
        const from = new Date(Date.now() - 10_000 + fromOffset);
        const until = new Date(from.getTime() + 364 * 24 * 60 * 60 * 1000);
        const g = await prisma.grant.create({
          data: {
            subject_id: member.subject_id,
            resource_id: dataset.resource_id,
            access_type_id: atId,
            valid_from: from,
            valid_until: until,
            granted_by: actor.subject_id,
            creation_type: 'MANUAL',
          },
        });
        localGrantIds.push(g.id);
        createdGrantIds.push(g.id);
      }
    });

    it('returns correct total count', async () => {
      const result = await grantsService.listGrantsForSubject({
        subject_id: member.subject_id,
        offset: 0,
        limit: 100,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      expect(result.metadata.total).toBeGreaterThanOrEqual(3);
    });

    it('respects limit in pagination', async () => {
      const result = await grantsService.listGrantsForSubject({
        subject_id: member.subject_id,
        offset: 0,
        limit: 2,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      expect(result.data.length).toBe(2);
    });

    afterAll(async () => {
      // Remove the grants created in this describe so they don't block listGrantsForResource tests
      await deleteGrants(localGrantIds);
    });
  });

  describe('listGrantsForResource', () => {
    it('active=true excludes revoked grants', async () => {
      // create and immediately revoke a grant
      const g = await makeUserGrant({ access_type_id: viewMetaId });
      await grantsService.revokeGrant(g.id, { actor_id: actor.subject_id });

      const result = await grantsService.listGrantsForResource({
        resource_id: dataset.resource_id,
        active: true,
        offset: 0,
        limit: 100,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).not.toContain(g.id);
    });

    it('active=false lists only non-active (revoked/expired) grants', async () => {
      const g = await makeUserGrant({ access_type_id: viewMetaId });
      await grantsService.revokeGrant(g.id, { actor_id: actor.subject_id });

      const result = await grantsService.listGrantsForResource({
        resource_id: dataset.resource_id,
        active: false,
        offset: 0,
        limit: 100,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      const ids = result.data.map((r) => r.id);
      expect(ids).toContain(g.id);
    });
  });

  describe('listAccessTypes', () => {
    it('returns a non-empty array', async () => {
      const types = await grantsService.listAccessTypes();
      expect(types.length).toBeGreaterThan(0);
    });

    it('each entry has name and id', async () => {
      const types = await grantsService.listAccessTypes();
      types.forEach((t) => {
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('id');
      });
    });
  });
});
