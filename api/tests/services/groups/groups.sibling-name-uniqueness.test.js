/**
 * groups.sibling-name-uniqueness.test.js
 *
 * `group.name` is unique among siblings rather than across the system. Two groups under
 * different parents may share a name; two under the same parent may not, and neither may two
 * roots. The rule is a unique index on `(parent_id, name) NULLS NOT DISTINCT`, so these tests
 * are about the database constraint as much as the service.
 *
 * `parent_id` is the authority for parentage and `group_closure` is derived from it, so every
 * write that sets one must set the other. The last test is what catches a path that forgets.
 *
 * @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let centreA;
let centreB;
const groupsToDelete = [];

/** Track for cleanup, children before parents, because parent_id is ON DELETE RESTRICT. */
function track(group) {
  groupsToDelete.unshift(group.id);
  return group;
}

beforeAll(async () => {
  actor = await createTestUser('_sib_actor');
  centreA = track(await createTestGroup(actor.subject_id, '_sib_A'));
  centreB = track(await createTestGroup(actor.subject_id, '_sib_B'));
}, 30_000);

afterAll(async () => {
  for (const id of groupsToDelete) await deleteGroup(id).catch(() => {});
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

test('the same name under two different parents is allowed', async () => {
  const name = `Microscopy Core ${Date.now()}`;

  const underA = track(await groupsService.createGroup({
    parent_id: centreA.id, data: { name }, actor_id: actor.subject_id,
  }));
  const underB = track(await groupsService.createGroup({
    parent_id: centreB.id, data: { name }, actor_id: actor.subject_id,
  }));

  expect(underA.name).toBe(name);
  expect(underB.name).toBe(name);
  expect(underA.id).not.toBe(underB.id);

  // The slug is still system-wide unique, so the second one is suffixed rather than reused.
  expect(underB.slug).not.toBe(underA.slug);
  expect(underB.slug.startsWith(underA.slug)).toBe(true);
});

test('the same name under the same parent is refused, and the refusal says where', async () => {
  const name = `Imaging ${Date.now()}`;
  track(await groupsService.createGroup({
    parent_id: centreA.id, data: { name }, actor_id: actor.subject_id,
  }));

  const before = await prisma.group.count();
  await expect(groupsService.createGroup({
    parent_id: centreA.id, data: { name }, actor_id: actor.subject_id,
  })).rejects.toMatchObject({
    status: 409,
    field: 'name',
    message: expect.stringContaining('under the same parent'),
  });

  expect(await prisma.group.count()).toBe(before);
});

test('two roots may not share a name, which is what NULLS NOT DISTINCT buys', async () => {
  // A plain unique index on (parent_id, name) would admit this, because Postgres treats each
  // NULL parent as distinct. This test fails the moment that clause is dropped.
  const name = `Root Centre ${Date.now()}`;
  track(await createTestGroup(actor.subject_id, '_sib_root', { name }));

  await expect(createTestGroup(actor.subject_id, '_sib_root2', { name }))
    .rejects.toMatchObject({
      status: 409,
      field: 'name',
      message: expect.stringContaining('top-level group'),
    });
});

test('renaming a group onto a sibling name is refused, onto a cousin name is allowed', async () => {
  const taken = `Held ${Date.now()}`;
  track(await groupsService.createGroup({
    parent_id: centreA.id, data: { name: taken }, actor_id: actor.subject_id,
  }));
  const mover = track(await createTestChildGroup(centreA.id, actor.subject_id, '_sib_mover'));

  await expect(groupsService.updateGroupMetadata(mover.id, {
    data: { name: taken }, expected_version: mover.version, actor_id: actor.subject_id,
  })).rejects.toMatchObject({ status: 409, field: 'name' });

  // The same name is free for a group under the other centre.
  const cousin = track(await createTestChildGroup(centreB.id, actor.subject_id, '_sib_cousin'));
  const renamed = await groupsService.updateGroupMetadata(cousin.id, {
    data: { name: taken }, expected_version: cousin.version, actor_id: actor.subject_id,
  });
  expect(renamed.name).toBe(taken);
});

test('createGroup writes parent_id, and it agrees with the closure', async () => {
  const child = track(await createTestChildGroup(centreA.id, actor.subject_id, '_sib_parented'));

  const row = await prisma.group.findUniqueOrThrow({
    where: { id: child.id },
    select: { parent_id: true },
  });
  expect(row.parent_id).toBe(centreA.id);

  const depthOne = await prisma.group_closure.findFirstOrThrow({
    where: { descendant_id: child.id, depth: 1 },
    select: { ancestor_id: true },
  });
  expect(depthOne.ancestor_id).toBe(row.parent_id);
});

test('every group in the database has parent_id agreeing with its closure', async () => {
  // A second write path that builds closure rows without setting parent_id would leave the
  // column null and silently move the group into the root name space. The seed does exactly
  // this in two places, so the invariant is asserted over the whole table rather than over
  // rows this file made.
  const mismatched = await prisma.$queryRawUnsafe(`
    SELECT g.id, g.name
    FROM "group" g
    LEFT JOIN group_closure gc ON gc.descendant_id = g.id AND gc.depth = 1
    WHERE g.parent_id IS DISTINCT FROM gc.ancestor_id`);

  expect(mismatched).toEqual([]);
});
