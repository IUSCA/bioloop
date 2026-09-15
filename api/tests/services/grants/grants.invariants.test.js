/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

/**
 * grants.invariants.test.js
 *
 * Tests that DB-level invariants and view semantics are upheld:
 *  - valid_period computed column reflects [valid_from, valid_until)
 *  - valid_grants view correctly filters revoked / future / expired grants
 *  - Transitive group membership resolves grants through the closure table
 *  - grants to either system principal apply to any authenticated user
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const { addGroupMembers } = require('@/services/groups');
const {
  AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID, SYSTEM_PRINCIPAL_GROUP_IDS,
  GRANT_ACCESS_TYPE_CATEGORY_LABELS,
} = require('@/constants');
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
        resource_type: 'DATASET',
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

  // Routes still require authentication, so both principals reach the same audience today.
  // The public one is the wider of the two and is honoured for a signed-in user because a
  // signed-in user is part of "everyone".
  // @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
  describe.each([
    ['Authenticated Users', AUTHENTICATED_USERS_GROUP_ID],
    ['Public', PUBLIC_GROUP_ID],
  ])('grants to the %s principal apply to all users', (principalName, principalId) => {
    let principalDataset;
    let unaffiliatedUser;

    beforeAll(async () => {
      unaffiliatedUser = await createTestUser(`_gi_unaffiliated_${principalName}`);
      createdUserIds.push(unaffiliatedUser.id);

      // A system principal cannot own datasets, so borrow any ordinary group as owner.
      const [ownerGroup] = await prisma.group.findMany({
        where: { id: { notIn: SYSTEM_PRINCIPAL_GROUP_IDS } },
        take: 1,
      });
      principalDataset = await createTestDataset(ownerGroup.id, `_gi_principal_${principalName}`);
      createdDatasetIds.push(principalDataset.id);

      const accessTypeId = await getAccessTypeId('DATASET:VIEW_METADATA');
      const principalGrant = await grantsService.createGrant(
        {
          subject_id: principalId,
          resource_id: principalDataset.resource_id,
          access_type_id: accessTypeId,
        },
        actor.subject_id,
      );
      createdGrantIds.push(principalGrant.id);
    });

    it('a user with no group memberships has access through it', async () => {
      const has = await grantsService.userHasGrant({
        user_id: unaffiliatedUser.subject_id,
        resource_type: 'DATASET',
        resource_id: principalDataset.resource_id,
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
    // @see docs/design/groups/access-presets.md — 2.11 Presets are scoped to collections
    it('offers no preset for a dataset', async () => {
      const presets = await grantsService.listPresets({ resource_type: 'DATASET' });
      expect(presets).toEqual([]);
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

    it('accepts a collection preset for COLLECTION resources', async () => {
      await expect(
        grantsService.assertGrantItemsApplicableToResourceType(
          prisma,
          'COLLECTION',
          [{ preset_id: BUILTIN_PRESET_DISCOVERABLE }],
        ),
      ).resolves.toBeUndefined();
    });
  });

  // @see docs/design/groups/ui-information-architecture.md — Access types in forms
  describe('access types in forms', () => {
    it('lists access types by heading, then by position under it', async () => {
      const types = await grantsService.listAccessTypes({ resource_type: 'COLLECTION' });
      const headingOrder = Object.keys(GRANT_ACCESS_TYPE_CATEGORY_LABELS);

      // Seeded ids and identifiers both sort differently from the headings, so an order by
      // either would fail here.
      const positions = types.map((t) => [headingOrder.indexOf(t.category), t.sort_order]);
      const sorted = [...positions].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(positions).toEqual(sorted);
      expect(types.map((t) => t.category_label))
        .toEqual(types.map((t) => GRANT_ACCESS_TYPE_CATEGORY_LABELS[t.category]));
    });

    it('lists no collection type for a dataset', async () => {
      const types = await grantsService.listAccessTypes({ resource_type: 'DATASET' });
      expect(types.filter((t) => t.category === 'COLLECTION')).toEqual([]);
      expect(types.length).toBeGreaterThan(0);
    });

    it('refuses a request item naming a type only an admin grants', async () => {
      const sensitiveId = await getAccessTypeId('DATASET:VIEW_SENSITIVE_METADATA');
      await expect(grantsService.assertItemsRequestable(prisma, [{ access_type_id: sensitiveId }]))
        .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cannot be requested/) });

      // The paired positive half, so the refusal is not a helper that refuses everything.
      await expect(grantsService.assertItemsRequestable(prisma, [{ access_type_id: viewMetaId }]))
        .resolves.toBeUndefined();
      await expect(grantsService.assertItemsRequestable(prisma, [{ preset_id: BUILTIN_PRESET_DISCOVERABLE }]))
        .resolves.toBeUndefined();
    });

    it('refuses a preset that includes a type only an admin grants', async () => {
      const sensitiveId = await getAccessTypeId('DATASET:VIEW_SENSITIVE_METADATA');
      const preset = await prisma.grant_preset.create({
        data: {
          name: `_inv_grant_only_${Date.now()}`,
          resource_types: ['DATASET'],
          access_type_items: { create: [{ access_type_id: viewMetaId }, { access_type_id: sensitiveId }] },
        },
      });
      try {
        await expect(grantsService.assertItemsRequestable(prisma, [{ preset_id: preset.id }]))
          .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cannot be requested/) });
      } finally {
        await prisma.grant_preset.delete({ where: { id: preset.id } });
      }
    });
  });
});
