/**
 * owningGroupGrant.test.js
 *
 * Membership of the owning group confers no read by itself. Creating a resource writes a
 * grant to the owning group, so what members hold is a visible, revocable row.
 *
 * @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
 */

const path = require('path');
const { GRANT_CREATION_TYPE, RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const collectionsService = require('@/services/collections');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let owner;
let member;
let group;

const collectionsToDelete = [];
const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  owner = await createTestUser('_owning_actor');
  member = await createTestUser('_owning_member');
  usersToDelete.push(owner.id, member.id);
  group = await createTestGroup(owner.subject_id, '_owning_group');
  groupsToDelete.push(group.id);
}, 30_000);

afterAll(async () => {
  for (const id of collectionsToDelete) {
    await prisma.grant.deleteMany({ where: { resource_id: id } });
    await prisma.collection.deleteMany({ where: { id } });
  }
  for (const id of datasetsToDelete) {
    await prisma.grant.deleteMany({ where: { resource: { dataset: { id } } } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

async function newCollection(tag) {
  const c = await collectionsService.createCollection(
    { name: `Test Collection ${Date.now()}${tag}`, owner_group_id: group.id },
    { actor_id: owner.subject_id },
  );
  collectionsToDelete.push(c.id);
  return c;
}

async function owningGroupGrants(resource_id) {
  return prisma.grant.findMany({
    where: { resource_id, subject_id: group.id, revoked_at: null },
    include: { access_type: true },
  });
}

describe('creating a collection seeds a grant to its owning group', () => {
  test('the grant exists and names the owning group as the subject', async () => {
    const collection = await newCollection('_seed1');

    const grants = await owningGroupGrants(collection.id);

    expect(grants).toHaveLength(1);
    expect(grants[0].subject_id).toBe(group.id);
  });

  test('it carries the collection read plane, not everything', async () => {
    const collection = await newCollection('_seed2');

    const [grant] = await owningGroupGrants(collection.id);

    expect(grant.access_type.name).toBe('COLLECTION:LIST_CONTENTS');
  });

  test('it is marked as issued by the system, not as a manual admin action', async () => {
    const collection = await newCollection('_seed3');

    const [grant] = await owningGroupGrants(collection.id);

    expect(grant.creation_type).toBe(GRANT_CREATION_TYPE.SYSTEM_BOOTSTRAP);
  });

  test('it never expires', async () => {
    const collection = await newCollection('_seed4');

    const [grant] = await owningGroupGrants(collection.id);

    expect(grant.valid_until).toBeNull();
  });

  test('it records the owning group as the issuing authority', async () => {
    const collection = await newCollection('_seed5');

    const [grant] = await owningGroupGrants(collection.id);

    expect(grant.issuing_authority_id).toBe(group.id);
  });
});

describe('a member reads through the seeded grant', () => {
  test('a member of the owning group can list the collection contents', async () => {
    const collection = await newCollection('_seed6');
    await prisma.group_user.create({
      data: { group_id: group.id, user_id: member.subject_id, role: 'MEMBER' },
    });

    const allowed = await grantsService.userHasGrant({
      user_id: member.subject_id,
      resource_type: RESOURCE_TYPE.COLLECTION,
      resource_id: collection.id,
      access_types: ['COLLECTION:LIST_CONTENTS'],
    });

    expect(allowed).toBe(true);
  });

  test('revoking it takes the member access with it', async () => {
    const collection = await newCollection('_seed7');
    const [grant] = await owningGroupGrants(collection.id);

    await grantsService.revokeGrant(grant.id, {
      actor_id: owner.subject_id,
      reason: 'test',
    });

    // The point of the decision: what members hold is a row an admin can remove.
    const allowed = await grantsService.userHasGrant({
      user_id: member.subject_id,
      resource_type: RESOURCE_TYPE.COLLECTION,
      resource_id: collection.id,
      access_types: ['COLLECTION:LIST_CONTENTS'],
    });

    expect(allowed).toBe(false);
  });

  test('a non-member gets nothing from it', async () => {
    const collection = await newCollection('_seed8');
    const stranger = await createTestUser('_owning_stranger');
    usersToDelete.push(stranger.id);

    const allowed = await grantsService.userHasGrant({
      user_id: stranger.subject_id,
      resource_type: RESOURCE_TYPE.COLLECTION,
      resource_id: collection.id,
      access_types: ['COLLECTION:LIST_CONTENTS'],
    });

    expect(allowed).toBe(false);
  });
});

describe('the seeding helper', () => {
  test('refuses a resource type it has no access type for', async () => {
    await expect(
      grantsService.seedOwningGroupGrant(prisma, {
        resource_id: 'irrelevant',
        resource_type: 'NOT_A_RESOURCE_TYPE',
        owner_group_id: group.id,
        actor_id: owner.subject_id,
      }),
    ).rejects.toThrow(/No owning-group access type is defined/);
  });

  test('gives a dataset the dataset read plane', async () => {
    const dataset = await createTestDataset(group.id, '_owning_ds');
    datasetsToDelete.push(dataset.id);

    await grantsService.seedOwningGroupGrant(prisma, {
      resource_id: dataset.resource_id,
      resource_type: RESOURCE_TYPE.DATASET,
      owner_group_id: group.id,
      actor_id: owner.subject_id,
    });

    const [grant] = await owningGroupGrants(dataset.resource_id);
    expect(grant.access_type.name).toBe('DATASET:LIST_FILES');
  });
});

describe('the backfill reaches a resource the services did not create', () => {
  test('a dataset inserted directly gets the grant when the backfill runs', async () => {
    // createTestDataset writes through Prisma, bypassing the service that seeds the grant,
    // so it stands in for a row that predates the rule.
    const dataset = await createTestDataset(group.id, '_owning_backfill');
    datasetsToDelete.push(dataset.id);

    expect(await owningGroupGrants(dataset.resource_id)).toHaveLength(0);

    // The same statement as migrations/20260908060000_owning_group_grants.
    await prisma.$executeRaw`
      INSERT INTO "grant" ("id", "subject_id", "resource_id", "access_type_id",
                           "creation_type", "valid_from", "granted_by",
                           "issuing_authority_id", "justification")
      SELECT (gen_random_uuid())::text,
             d."owner_group_id",
             d."resource_id",
             gat."id",
             'SYSTEM_BOOTSTRAP'::"GRANT_CREATION_TYPE",
             CURRENT_TIMESTAMP,
             svc."subject_id",
             d."owner_group_id",
             'Seeded at creation: the owning group reads what it governs'
      FROM "dataset" d
               JOIN "grant_access_type" gat ON gat."name" = 'DATASET:LIST_FILES'
               JOIN "user" svc ON svc."username" = 'svc_tasks'
      WHERE d."id" = ${dataset.id}
        AND NOT EXISTS (SELECT 1
                        FROM "grant" g
                        WHERE g."resource_id" = d."resource_id"
                          AND g."subject_id" = d."owner_group_id"
                          AND g."access_type_id" = gat."id"
                          AND g."revoked_at" IS NULL)
    `;

    const [grant] = await owningGroupGrants(dataset.resource_id);
    expect(grant.access_type.name).toBe('DATASET:LIST_FILES');
    expect(grant.creation_type).toBe(GRANT_CREATION_TYPE.SYSTEM_BOOTSTRAP);
  });

  test('running it a second time adds nothing', async () => {
    const dataset = await createTestDataset(group.id, '_owning_twice');
    datasetsToDelete.push(dataset.id);

    const backfill = () => prisma.$executeRaw`
      INSERT INTO "grant" ("id", "subject_id", "resource_id", "access_type_id",
                           "creation_type", "valid_from", "granted_by",
                           "issuing_authority_id", "justification")
      SELECT (gen_random_uuid())::text, d."owner_group_id", d."resource_id", gat."id",
             'SYSTEM_BOOTSTRAP'::"GRANT_CREATION_TYPE", CURRENT_TIMESTAMP,
             svc."subject_id", d."owner_group_id", 'x'
      FROM "dataset" d
               JOIN "grant_access_type" gat ON gat."name" = 'DATASET:LIST_FILES'
               JOIN "user" svc ON svc."username" = 'svc_tasks'
      WHERE d."id" = ${dataset.id}
        AND NOT EXISTS (SELECT 1
                        FROM "grant" g
                        WHERE g."resource_id" = d."resource_id"
                          AND g."subject_id" = d."owner_group_id"
                          AND g."access_type_id" = gat."id"
                          AND g."revoked_at" IS NULL)
    `;

    await backfill();
    // The guard matters: without it a second run trips the grant_no_overlap constraint.
    await backfill();

    expect(await owningGroupGrants(dataset.resource_id)).toHaveLength(1);
  });
});
