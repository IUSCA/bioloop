/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

/**
 * grants.invariants.test.js
 *
 * Tests that DB-level invariants and view semantics are upheld:
 *  - valid_period computed column reflects [valid_from, valid_until)
 *  - valid_grants view correctly filters revoked / future / expired grants
 *  - Transitive group membership resolves grants through the closure table
 *  - EVERYONE group grants apply to any authenticated user
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const { addGroupMembers } = require('@/services/groups');
const { EVERYONE_GROUP_ID } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
  deleteDataset,
  deleteGrants,
  getAccessTypeId,
} = require('../helpers');

let actor;
let member;
let dataset;
let viewMetaId;

const BUILTIN_PRESET_DISCOVERABLE = 1;

const createdGrantIds = [];
const createdGroupIds = [];
const createdUserIds = [];
const createdDatasetIds = [];

// cSpell: ignore vfrom, vuntil

beforeAll(async () => {
  actor = await createTestUser('_gi_actor');
  member = await createTestUser('_gi_member');
  createdUserIds.push(actor.id, member.id);

  const group = await createTestGroup(actor.subject_id, '_gi');
  createdGroupIds.push(group.id);

  dataset = await createTestDataset(group.id, '_gi');
  createdDatasetIds.push(dataset.id);

  viewMetaId = await getAccessTypeId('DATASET:VIEW_METADATA');
}, 30_000);

afterAll(async () => {
  await deleteGrants(createdGrantIds);
  for (const id of createdDatasetIds) await deleteDataset(id);
  for (const id of createdGroupIds) await deleteGroup(id);
  for (const id of createdUserIds) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function insertRawGrant(overrides = {}) {
  const g = await prisma.grant.create({
    data: {
      subject_id: member.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: viewMetaId,
      granted_by: actor.subject_id,
      creation_type: 'MANUAL',
      ...overrides,
    },
  });
  createdGrantIds.push(g.id);
  return g;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('grants - invariants', () => {
  describe('valid_period computed column', () => {
    it('lower bound equals valid_from and is inclusive', async () => {
      const validFrom = new Date('2025-01-01T00:00:00Z');
      const validUntil = new Date('2026-01-01T00:00:00Z');
      const grant = await insertRawGrant({ valid_from: validFrom, valid_until: validUntil });

      const [row] = await prisma.$queryRaw`
        SELECT
          lower(valid_period)   AS vfrom,
          upper(valid_period)   AS vuntil,
          lower_inc(valid_period) AS lower_inclusive,
          upper_inc(valid_period) AS upper_inclusive
        FROM "grant"
        WHERE id = ${grant.id}
      `;

      expect(new Date(row.vfrom).toISOString()).toBe(validFrom.toISOString());
      expect(new Date(row.vuntil).toISOString()).toBe(validUntil.toISOString());
      expect(row.lower_inclusive).toBe(true);
      expect(row.upper_inclusive).toBe(false);
    });

    it('valid_period has infinite upper bound when valid_until is null', async () => {
      // We need a window that does not overlap with any existing grants.
      // Use a far-future valid_from to avoid the exclusion constraint.
      const farFuture = new Date('2099-01-01T00:00:00Z');
      const grant = await insertRawGrant({ valid_from: farFuture, valid_until: null });

      const [row] = await prisma.$queryRaw`
        SELECT upper_inf(valid_period) AS is_infinite
        FROM "grant"
        WHERE id = ${grant.id}
      `;

      expect(row.is_infinite).toBe(true);
    });
  });

  describe('valid_grants view', () => {
    it('includes a currently valid, non-revoked grant', async () => {
      const grant = await insertRawGrant({
        valid_from: new Date(Date.now() - 1000),
        valid_until: new Date(Date.now() + 60 * 60 * 1000),
      });

      const [row] = await prisma.$queryRaw`
        SELECT id FROM valid_grants WHERE id = ${grant.id}
      `;
      expect(row).toBeDefined();
      expect(row.id).toBe(grant.id);
      // Revoke immediately so subsequent tests can use the same time window
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });
    });

    it('excludes a revoked grant', async () => {
      const grant = await insertRawGrant({
        valid_from: new Date(Date.now() - 1000),
        valid_until: new Date(Date.now() + 60 * 60 * 1000),
      });
      await grantsService.revokeGrant(grant.id, { actor_id: actor.subject_id });

      const rows = await prisma.$queryRaw`
        SELECT id FROM valid_grants WHERE id = ${grant.id}
      `;
      expect(rows).toHaveLength(0);
    });

    it('excludes a grant whose valid_from is in the future', async () => {
      const grant = await insertRawGrant({
        valid_from: new Date(Date.now() + 2 * 60 * 60 * 1000), // +2 hours
        valid_until: new Date(Date.now() + 3 * 60 * 60 * 1000),
      });

      const rows = await prisma.$queryRaw`
        SELECT id FROM valid_grants WHERE id = ${grant.id}
      `;
      expect(rows).toHaveLength(0);
    });

    it('excludes a grant whose valid_until is in the past', async () => {
      const grant = await prisma.grant.create({
        data: {
          subject_id: member.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetaId,
          granted_by: actor.subject_id,
          valid_from: new Date(Date.now() - 2 * 60 * 60 * 1000),
          valid_until: new Date(Date.now() - 1000), // expired 1 second ago
          creation_type: 'MANUAL',
        },
      });
      createdGrantIds.push(grant.id);

      const rows = await prisma.$queryRaw`
        SELECT id FROM valid_grants WHERE id = ${grant.id}
      `;
      expect(rows).toHaveLength(0);
    });
  });

  describe('transitive group membership grant', () => {
    let parentGroup;
    let childGroup;
    let transitiveUser;
    let transitiveDataset;
    let transitiveGrant;

    beforeAll(async () => {
      transitiveUser = await createTestUser('_gi_trans');
      createdUserIds.push(transitiveUser.id);

      parentGroup = await createTestGroup(actor.subject_id, '_gi_parent');
      createdGroupIds.push(parentGroup.id);

      childGroup = await createTestChildGroup(parentGroup.id, actor.subject_id, '_gi_child');
      createdGroupIds.push(childGroup.id);

      transitiveDataset = await createTestDataset(parentGroup.id, '_gi_trans');
      createdDatasetIds.push(transitiveDataset.id);

      // Add user to the CHILD group only

      await addGroupMembers(childGroup.id, { user_ids: [transitiveUser.subject_id], actor_id: actor.subject_id });

      // Grant access to the PARENT group
      transitiveGrant = await grantsService.createGrant(
        {
          subject_id: parentGroup.id,
          resource_id: transitiveDataset.resource_id,
          access_type_id: viewMetaId,
        },
        actor.subject_id,
      );
      createdGrantIds.push(transitiveGrant.id);
    });

    it('user in child group inherits access from parent group grant', async () => {
      const has = await grantsService.userHasGrant({
        user_id: transitiveUser.subject_id,
        resource_id: transitiveDataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(true);
    });

    it('getGrantAccessTypesForUser returns the access type name', async () => {
      const types = await grantsService
        .getGrantAccessTypesForUser(
          transitiveUser.subject_id,
          transitiveDataset.resource_id,
          'DATASET',
        );
      expect(types.has('DATASET:VIEW_METADATA')).toBe(true);
    });
  });

  describe('EVERYONE group grants apply to all users', () => {
    let everyoneDataset;
    let everyoneGrant;
    let unaffiliatedUser;

    beforeAll(async () => {
      unaffiliatedUser = await createTestUser('_gi_unaffiliated');
      createdUserIds.push(unaffiliatedUser.id);

      // Use the group from the outer scope as owner (EVERYONE group cannot own datasets)
      const [ownerGroup] = await prisma.group.findMany({
        where: { id: { not: EVERYONE_GROUP_ID } },
        take: 1,
      });
      everyoneDataset = await createTestDataset(ownerGroup.id, '_gi_everyone');
      createdDatasetIds.push(everyoneDataset.id);

      const everyoneAccessTypeId = await getAccessTypeId('DATASET:VIEW_METADATA');
      everyoneGrant = await grantsService.createGrant(
        {
          subject_id: EVERYONE_GROUP_ID,
          resource_id: everyoneDataset.resource_id,
          access_type_id: everyoneAccessTypeId,
        },
        actor.subject_id,
      );
      createdGrantIds.push(everyoneGrant.id);
    });

    it('a user with no group memberships has access via the EVERYONE grant', async () => {
      const has = await grantsService.userHasGrant({
        user_id: unaffiliatedUser.subject_id,
        resource_id: everyoneDataset.resource_id,
        access_types: ['DATASET:VIEW_METADATA'],
      });
      expect(has).toBe(true);
    });
  });

  describe('grant_no_overlap exclusion constraint fires for same subject/resource/access_type/time', () => {
    it('second insertion with an overlapping window is rejected via the service with a 409', async () => {
      // Use the service for both to get proper error conversion.
      const g1 = await grantsService.createGrant(
        {
          subject_id: member.subject_id,
          resource_id: dataset.resource_id,
          access_type_id: viewMetaId,
          valid_from: new Date('2032-01-01T00:00:00Z'),
          valid_until: new Date('2033-01-01T00:00:00Z'),
        },
        actor.subject_id,
      );
      createdGrantIds.push(g1.id);

      // Overlapping window: starts within g1's range
      await expect(
        grantsService.createGrant(
          {
            subject_id: member.subject_id,
            resource_id: dataset.resource_id,
            access_type_id: viewMetaId,
            valid_from: new Date('2032-06-01T00:00:00Z'),
            valid_until: new Date('2033-06-01T00:00:00Z'),
          },
          actor.subject_id,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('grant presets resource_type behavior', () => {
    it('lists dataset-only presets when resource_type=DATASET', async () => {
      const presets = await grantsService.listPresets('DATASET');
      expect(presets.length).toBeGreaterThanOrEqual(1);
      expect(presets.every((preset) => preset.resource_types.includes('DATASET'))).toBe(true);
    });

    it('rejects collection-specific access types for DATASET resources', async () => {
      const collectionTypeId = await getAccessTypeId('COLLECTION:VIEW_METADATA');
      await expect(
        grantsService.assertGrantItemsApplicableToResourceType(
          prisma,
          'DATASET',
          [{ access_type_id: collectionTypeId }],
        ),
      ).rejects.toThrow('not valid for resource type DATASET');
    });

    it('rejects a collection preset for DATASET resources', async () => {
      await expect(
        grantsService.assertGrantItemsApplicableToResourceType(
          prisma,
          'DATASET',
          [{ preset_id: BUILTIN_PRESET_DISCOVERABLE }],
        ),
      ).rejects.toThrow('not applicable to resource type DATASET');
    });

    it('accepts a dataset-specific preset for DATASET resources', async () => {
      await expect(
        grantsService.assertGrantItemsApplicableToResourceType(
          prisma,
          'DATASET',
          [{ preset_id: 4 }],
        ),
      ).resolves.toBeUndefined();
    });
  });
});
