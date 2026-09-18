/**
 * viewProfile.test.js
 *
 * `view_profile` is the one action an unauthenticated caller can satisfy, and these tests
 * pin both halves of that: who it admits, and how little it hands back.
 *
 * Everything goes through `authorizeAction`, which is the engine the routes use. Several
 * cases deliberately pass identifiers only, with no pre-fetched user, so the `is_anonymous`
 * virtual attribute is actually exercised — a virtual attribute is dead code on the route
 * path, because the middleware pre-fetches `req.user`.
 *
 * @see docs/design/groups/profiles.md — What each audience sees
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const { ANONYMOUS_PRINCIPAL } = require('@/constants');
const {
  PUBLIC_PROFILE_ATTRIBUTES: GROUP_PUBLIC_PROFILE_ATTRIBUTES,
} = require('@/authorization/builtin/policies/group');
const {
  PUBLIC_PROFILE_ATTRIBUTES: COLLECTION_PUBLIC_PROFILE_ATTRIBUTES,
} = require('@/authorization/builtin/policies/collection');
const {
  createTestUser,
  createTestGroup,
  createTestCollection,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let admin;
let member;
let outsider;
let group;
let collection;

/** A fresh execution context per call, so nothing is answered from a warm cache. */
function freshContext() {
  return { cache: { user: new Map(), resource: new Map(), context: new Map() } };
}

/** The anonymous caller as the middleware supplies it: identifiers plus a pre-fetched user. */
function asAnonymous(resourceType, action, resourceId) {
  return authorizeAction(resourceType, action, {
    identifiers: { user: ANONYMOUS_PRINCIPAL.subject_id, resource: resourceId },
    policyExecutionContext: freshContext(),
    preFetched: { user: ANONYMOUS_PRINCIPAL },
  });
}

/** A signed-in caller with nothing pre-fetched, so every user attribute is hydrated. */
function asUser(resourceType, action, resourceId, subject_id) {
  return authorizeAction(resourceType, action, {
    identifiers: { user: subject_id, resource: resourceId },
    policyExecutionContext: freshContext(),
  });
}

function setGroupVisibility(profile_visibility) {
  return prisma.group.update({ where: { id: group.id }, data: { profile_visibility } });
}

function setCollectionVisibility(profile_visibility) {
  return prisma.collection.update({
    where: { id: collection.id },
    data: { profile_visibility },
  });
}

beforeAll(async () => {
  admin = await createTestUser('_vp_admin');
  member = await createTestUser('_vp_member');
  outsider = await createTestUser('_vp_outsider');
  group = await createTestGroup(admin.subject_id, '_vp_group');
  // createGroup records the actor as the creator; it does not make them a member. Both
  // memberships are written explicitly so the ADMIN and MEMBER arms are actually distinct.
  await prisma.group_user.createMany({
    data: [
      { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
      { group_id: group.id, user_id: member.subject_id, role: 'MEMBER' },
    ],
  });
  collection = await createTestCollection(group.id, admin.subject_id, '_vp_coll');
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
  await deleteCollection(collection.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(outsider.id);
  await deleteUser(member.id);
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

describe('visibility decides who may read a group profile', () => {
  test('PRIVATE admits neither an anonymous nor a signed-in stranger', async () => {
    await setGroupVisibility('PRIVATE');

    expect((await asAnonymous('group', 'view_profile', group.id)).granted).toBe(false);
    expect((await asUser('group', 'view_profile', group.id, outsider.subject_id)).granted)
      .toBe(false);
  });

  test('AUTHENTICATED admits a signed-in stranger and refuses an anonymous caller', async () => {
    await setGroupVisibility('AUTHENTICATED');

    expect((await asAnonymous('group', 'view_profile', group.id)).granted).toBe(false);
    expect((await asUser('group', 'view_profile', group.id, outsider.subject_id)).granted)
      .toBe(true);
  });

  test('PUBLIC admits both', async () => {
    await setGroupVisibility('PUBLIC');

    expect((await asAnonymous('group', 'view_profile', group.id)).granted).toBe(true);
    expect((await asUser('group', 'view_profile', group.id, outsider.subject_id)).granted)
      .toBe(true);
  });

  test('a member reads the profile of a PRIVATE group', async () => {
    await setGroupVisibility('PRIVATE');

    expect((await asUser('group', 'view_profile', group.id, member.subject_id)).granted)
      .toBe(true);
    expect((await asUser('group', 'view_profile', group.id, admin.subject_id)).granted)
      .toBe(true);
  });

  test('publishing a profile grants no access to anything else', async () => {
    await setGroupVisibility('PUBLIC');

    // view_metadata, members, and the audit log are all untouched by visibility.
    for (const action of ['view_metadata', 'view_members', 'view_audit_logs']) {
      // eslint-disable-next-line no-await-in-loop
      const result = await asUser('group', action, group.id, outsider.subject_id);
      expect(result.granted).toBe(false);
    }
    expect((await asAnonymous('group', 'view_metadata', group.id)).granted).toBe(false);
  });
});

describe('what a public group profile hands back', () => {
  beforeAll(() => setGroupVisibility('PUBLIC'));

  test('an anonymous caller gets the public profile fields and nothing more', async () => {
    const { granted, filter } = await asAnonymous('group', 'view_profile', group.id);
    expect(granted).toBe(true);

    const row = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: true } } },
    });
    const projected = filter({
      ...row,
      _count: { members: 2 },
      admins: [{
        id: admin.id, name: 'A', email: 'a@example.com', username: 'a',
      }],
      ancestors: [{ id: 'x', name: 'Parent' }],
    });

    expect(projected).toHaveProperty('name');
    expect(projected).toHaveProperty('tagline');
    expect(projected).toHaveProperty('about_md');
    expect(projected._count).toBeUndefined();
    expect(projected.ancestors).toBeUndefined();
    expect(projected.allow_user_contributions).toBeUndefined();
    expect(projected.archive_key).toBeUndefined();
    expect(projected.admins?.[0]?.email).toBeUndefined();
    expect(projected.admins?.[0]?.name).toBe('A');
  });

  test('a member still gets the member view of the same action', async () => {
    const { granted, filter } = await asUser('group', 'view_profile', group.id, member.subject_id);
    expect(granted).toBe(true);

    const projected = filter({
      id: group.id,
      name: group.name,
      allow_user_contributions: false,
      admins: [{ id: admin.id, name: 'A', email: 'a@example.com' }],
    });
    expect(projected.allow_user_contributions).toBe(false);
    expect(projected.admins[0].email).toBe('a@example.com');
  });

  test('the public list leaks no counts, addresses, or ancestry', () => {
    for (const attr of GROUP_PUBLIC_PROFILE_ATTRIBUTES) {
      expect(attr).not.toMatch(/_count/);
      expect(attr).not.toMatch(/email/);
      expect(attr).not.toMatch(/^ancestors/);
      expect(attr).not.toBe('*');
    }
  });
});

describe('a collection profile follows the same rules', () => {
  test('PRIVATE refuses an anonymous caller, PUBLIC admits one', async () => {
    await setCollectionVisibility('PRIVATE');
    expect((await asAnonymous('collection', 'view_profile', collection.id)).granted)
      .toBe(false);

    await setCollectionVisibility('PUBLIC');
    expect((await asAnonymous('collection', 'view_profile', collection.id)).granted)
      .toBe(true);
  });

  test('a public collection profile does not say how many datasets it holds', async () => {
    await setCollectionVisibility('PUBLIC');
    const { filter } = await asAnonymous('collection', 'view_profile', collection.id);

    const projected = filter({
      id: collection.id,
      name: collection.name,
      tagline: 'a line',
      _count: { datasets: 20 },
      owner_group: { id: group.id, name: group.name, slug: group.slug },
    });

    expect(projected.name).toBe(collection.name);
    expect(projected.owner_group.name).toBe(group.name);
    expect(projected._count).toBeUndefined();

    for (const attr of COLLECTION_PUBLIC_PROFILE_ATTRIBUTES) {
      expect(attr).not.toMatch(/_count/);
      expect(attr).not.toMatch(/email/);
    }
  });

  test('a public profile still refuses to list the datasets', async () => {
    await setCollectionVisibility('PUBLIC');
    expect((await asAnonymous('collection', 'list_datasets', collection.id)).granted)
      .toBe(false);
    expect((await asUser('collection', 'list_datasets', collection.id, outsider.subject_id)).granted).toBe(false);
  });
});
