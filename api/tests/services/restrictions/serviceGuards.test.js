/**
 * serviceGuards.test.js
 *
 * The service guards are the second line behind the middleware's restriction check. They read
 * `effective_restriction`, as the middleware does, so a child of an archived group is refused
 * inside the service even though the child's own `is_archived` column is still false. The
 * calls below go straight to the services, which is the case a group archived between the
 * middleware's check and the write reaches.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The restriction layer keeps its three lines
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');
const invitationsService = require('@/services/invitations');
const {
  createTestUser,
  createTestGroup,
  createTestChildGroup,
  createTestDataset,
  createTestCollection,
  deleteCollection,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let joiner;
let parent;
let child;
let collection;
let dataset;
let invitation;

beforeAll(async () => {
  actor = await createTestUser('_sg_actor');
  joiner = await createTestUser('_sg_joiner');
  parent = await createTestGroup(actor.subject_id, '_sg_parent');
  child = await createTestChildGroup(parent.id, actor.subject_id, '_sg_child');
  await prisma.group_user.create({ data: { group_id: child.id, user_id: actor.subject_id, role: 'ADMIN' } });
  collection = await createTestCollection(child.id, actor.subject_id, '_sg_coll');
  dataset = await createTestDataset(child.id, '_sg_ds');
  ({ invitation } = await invitationsService.createInvitation({
    group_id: child.id, email: `sg_${Date.now()}@example.org`, invited_by: actor.subject_id,
  }));
  await groupsService.archiveGroup(parent.id, actor.subject_id);
}, 30_000);

afterAll(async () => {
  await groupsService.unarchiveGroup(parent.id, actor.subject_id).catch(() => {});
  await prisma.group_invitation.deleteMany({ where: { group_id: child.id } });
  await deleteCollection(collection.id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(child.id).catch(() => {});
  await deleteGroup(parent.id).catch(() => {});
  await deleteUser(joiner.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

const conflict = expect.objectContaining({ status: 409 });

test("the child's and the collection's own columns are not archived", async () => {
  // Forced unless only the view knows: a guard reading the column would let every call below through.
  const [childRow, collectionRow] = await Promise.all([
    prisma.group.findUnique({ where: { id: child.id } }),
    prisma.collection.findUnique({ where: { id: collection.id } }),
  ]);
  expect(childRow.is_archived).toBe(false);
  expect(collectionRow.is_archived).toBe(false);
});

test('a membership change in the child is refused', async () => {
  await expect(groupsService.addGroupMembers(child.id, { user_ids: [joiner.subject_id], actor_id: actor.subject_id }))
    .rejects.toEqual(conflict);
  await expect(groupsService.removeGroupMembers(child.id, { user_ids: [actor.subject_id], actor_id: actor.subject_id }))
    .rejects.toEqual(conflict);
});

test("an edit to the child's metadata is refused", async () => {
  const { version } = await prisma.group.findUnique({ where: { id: child.id } });
  await expect(groupsService.updateGroupMetadata(child.id, {
    data: { tagline: 'refused' }, expected_version: version, actor_id: actor.subject_id,
  })).rejects.toEqual(conflict);
});

test("a change to the child's collection is refused", async () => {
  const { version } = await prisma.collection.findUnique({ where: { id: collection.id } });
  await expect(collectionsService.updateCollectionMetadata(collection.id, {
    data: { tagline: 'refused' }, expected_version: version,
  })).rejects.toEqual(conflict);
  await expect(collectionsService.addDatasets(collection.id, {
    dataset_ids: [dataset.resource_id], actor_id: actor.subject_id,
  })).rejects.toEqual(conflict);
});

test('an invitation to the child is neither issued nor valid', async () => {
  await expect(invitationsService.createInvitation({
    group_id: child.id, email: `sg2_${Date.now()}@example.org`, invited_by: actor.subject_id,
  })).rejects.toEqual(conflict);
  const { token } = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
  expect(await invitationsService.checkInvitationToken(token)).toEqual({ status: 'invalid' });
});
