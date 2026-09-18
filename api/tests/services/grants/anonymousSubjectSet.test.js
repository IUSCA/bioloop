/**
 * anonymousSubjectSet.test.js
 *
 * The containment between the two system principals runs one way only.
 *
 * `Public` is the wider audience, so a signed-in caller holds grants made to `Public` and
 * to `Authenticated Users`. An unauthenticated caller holds only what was granted to
 * `Public`. A subject set that added both principals unconditionally would give an anonymous
 * caller every grant an admin meant for signed-in users.
 *
 * The tests are written against `getGrantAccessTypesForUser`, which reads the grant rows of
 * `accessPathsQuery`, the statement the context hydrator's `access_paths` reads.
 *
 * @see docs/design/groups/access-model.md — Base relations
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const {
  AUTHENTICATED_USERS_GROUP_ID,
  PUBLIC_GROUP_ID,
  ANONYMOUS_PRINCIPAL,
} = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestCollection,
  getAccessTypeId,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let outsider;
let group;
let collection;
let viewMetadataId;

beforeAll(async () => {
  actor = await createTestUser('_anon_actor');
  outsider = await createTestUser('_anon_outsider');
  group = await createTestGroup(actor.subject_id, '_anon_group');
  collection = await createTestCollection(group.id, actor.subject_id, '_anon_coll');
  viewMetadataId = await getAccessTypeId('COLLECTION:VIEW_METADATA');
}, 30_000);

afterEach(async () => {
  // Clear by resource rather than by tracked id. Every test here grants the same access
  // type on the same collection, so two of them contend for the `grant_no_overlap`
  // exclusion constraint, and an assertion that depends on the previous test's bookkeeping
  // is order-dependent by construction.
  await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
});

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
  await deleteCollection(collection.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(outsider.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

async function grantTo(subject_id) {
  return prisma.grant.create({
    data: {
      subject_id,
      resource_id: collection.id,
      access_type_id: viewMetadataId,
      granted_by: actor.subject_id,
      creation_type: 'MANUAL',
    },
  });
}

function accessTypesFor(subject_id) {
  return grantsService.getGrantAccessTypesForUser(subject_id, collection.id, 'COLLECTION');
}

describe('the anonymous caller resolves only Public grants', () => {
  test('a grant to Authenticated Users does not reach an anonymous caller', async () => {
    await grantTo(AUTHENTICATED_USERS_GROUP_ID);

    const anonymous = await accessTypesFor(ANONYMOUS_PRINCIPAL.subject_id);
    expect(anonymous.has('COLLECTION:VIEW_METADATA')).toBe(false);
    expect(anonymous.size).toBe(0);
  });

  test('the same grant does reach a signed-in caller who is not a member', async () => {
    await grantTo(AUTHENTICATED_USERS_GROUP_ID);

    const signedIn = await accessTypesFor(outsider.subject_id);
    expect(signedIn.has('COLLECTION:VIEW_METADATA')).toBe(true);
  });

  test('a grant to Public reaches an anonymous caller', async () => {
    await grantTo(PUBLIC_GROUP_ID);

    const anonymous = await accessTypesFor(ANONYMOUS_PRINCIPAL.subject_id);
    expect(anonymous.has('COLLECTION:VIEW_METADATA')).toBe(true);
  });

  test('a grant to Public also reaches a signed-in caller', async () => {
    await grantTo(PUBLIC_GROUP_ID);

    const signedIn = await accessTypesFor(outsider.subject_id);
    expect(signedIn.has('COLLECTION:VIEW_METADATA')).toBe(true);
  });

  test('an anonymous caller holds nothing when no grant names Public', async () => {
    await grantTo(outsider.subject_id);

    const anonymous = await accessTypesFor(ANONYMOUS_PRINCIPAL.subject_id);
    expect(anonymous.size).toBe(0);
  });

  test('the anonymous principal expands no group memberships of its own', async () => {
    // PUBLIC_GROUP_ID is a group row, so a naive subject-set builder would try to expand it
    // through effective_user_groups. It has no members and must never gain any.
    const members = await prisma.$queryRaw`
      SELECT user_id FROM effective_user_groups WHERE group_id = ${PUBLIC_GROUP_ID}
    `;
    expect(members).toEqual([]);
  });
});
