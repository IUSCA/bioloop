/**
 * profileColumns.test.js
 *
 * The profile columns on `group` and `collection`, and the two rules the database enforces
 * that `schema.prisma` cannot express.
 *
 * A profile is informational. The only column here that any policy reads is
 * `profile_visibility`, and it decides who may read the profile, never who may read data.
 * These tests pin the default, because a column that defaulted to anything but PRIVATE
 * would publish every existing row the moment the migration ran.
 *
 * @see docs/design/groups/profiles.md — The columns
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const {
  createTestUser,
  createTestGroup,
  createTestCollection,
  deleteCollection,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let group;
let collection;

beforeAll(async () => {
  actor = await createTestUser('_prof_actor');
  group = await createTestGroup(actor.subject_id, '_prof_group');
  collection = await createTestCollection(group.id, actor.subject_id, '_prof_coll');
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { resource_id: collection.id } });
  await deleteCollection(collection.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

describe('a profile is private until somebody publishes it', () => {
  test('a new group is PRIVATE', async () => {
    const row = await prisma.group.findUnique({
      where: { id: group.id },
      select: { profile_visibility: true, tagline: true, about_md: true, avatar_key: true },
    });
    expect(row.profile_visibility).toBe('PRIVATE');
    expect(row.tagline).toBeNull();
    expect(row.about_md).toBeNull();
    expect(row.avatar_key).toBeNull();
  });

  test('a new collection is PRIVATE', async () => {
    const row = await prisma.collection.findUnique({
      where: { id: collection.id },
      select: { profile_visibility: true, tagline: true, about_md: true },
    });
    expect(row.profile_visibility).toBe('PRIVATE');
    expect(row.tagline).toBeNull();
    expect(row.about_md).toBeNull();
  });

  test('every visibility the enum names is accepted', async () => {
    for (const value of ['AUTHENTICATED', 'PUBLIC', 'PRIVATE']) {
      // eslint-disable-next-line no-await-in-loop
      const updated = await prisma.group.update({
        where: { id: group.id },
        data: { profile_visibility: value },
        select: { profile_visibility: true },
      });
      expect(updated.profile_visibility).toBe(value);
    }
  });
});

describe('the tagline rules live in the database', () => {
  test('a blank tagline is refused', async () => {
    // Prisma expresses the length but not "not only whitespace", so the check constraint
    // is the only thing standing between a caller and a tagline that renders as an empty
    // line under the group name.
    await expect(prisma.group.update({
      where: { id: group.id },
      data: { tagline: '   ' },
    })).rejects.toThrow();
  });

  test('a tagline longer than 120 characters is refused', async () => {
    await expect(prisma.group.update({
      where: { id: group.id },
      data: { tagline: 'x'.repeat(121) },
    })).rejects.toThrow();
  });

  test('a tagline of exactly 120 characters is accepted', async () => {
    const tagline = 'x'.repeat(120);
    const updated = await prisma.group.update({
      where: { id: group.id },
      data: { tagline },
      select: { tagline: true },
    });
    expect(updated.tagline).toBe(tagline);
  });

  test('the same two rules hold for a collection', async () => {
    await expect(prisma.collection.update({
      where: { id: collection.id },
      data: { tagline: '  ' },
    })).rejects.toThrow();

    await expect(prisma.collection.update({
      where: { id: collection.id },
      data: { tagline: 'y'.repeat(121) },
    })).rejects.toThrow();
  });

  test('a null tagline stays legal', async () => {
    const updated = await prisma.group.update({
      where: { id: group.id },
      data: { tagline: null },
      select: { tagline: true },
    });
    expect(updated.tagline).toBeNull();
  });
});
