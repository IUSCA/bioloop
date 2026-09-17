/**
 * expiringGrants.oversight.test.js
 *
 * The expiring-grants list shows a caller every grant they may list: those on resources whose
 * owning group they administer or oversee, as `grant.list_for_resource` decides.
 *
 * An admin of a parent group may open the child group's grants, so a list that read admin
 * memberships alone would hide their expiry from that admin.
 *
 * @see docs/design/groups/design.md — What Oversight Allows (Read-Only)
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { listExpiringGrantsForAdmin } = require('@/services/grants/fetch');
const {
  createTestUser, createTestGroup, createTestChildGroup, createTestDataset, getAccessTypeId,
  deleteUser, deleteGroup, deleteDataset,
} = require('../helpers');

const DAY = 24 * 60 * 60 * 1000;

let actor;
let overseer;
let holder;
let outsider;
let parent;
let child;
let dataset;
let grant;

beforeAll(async () => {
  actor = await createTestUser('_eg_actor');
  overseer = await createTestUser('_eg_overseer');
  holder = await createTestUser('_eg_holder');
  outsider = await createTestUser('_eg_outsider');

  parent = await createTestGroup(actor.subject_id, '_eg_parent');
  child = await createTestChildGroup(parent.id, actor.subject_id, '_eg_child');
  await groupsService.addGroupMembers(parent.id, { user_ids: [overseer.subject_id], actor_id: actor.subject_id });
  await groupsService.promoteGroupMemberToAdmin(parent.id, {
    user_id: overseer.subject_id, actor_id: actor.subject_id,
  });

  dataset = await createTestDataset(child.id, '_eg_dataset');
  grant = await prisma.grant.create({
    data: {
      subject_id: holder.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: await getAccessTypeId('DATASET:VIEW_METADATA'),
      granted_by: actor.subject_id,
      creation_type: 'MANUAL',
      valid_until: new Date(Date.now() + 5 * DAY),
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { id: grant.id } });
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(child.id).catch(() => {});
  await deleteGroup(parent.id).catch(() => {});
  for (const u of [actor, overseer, holder, outsider]) await deleteUser(u.id); // eslint-disable-line no-await-in-loop
  await prisma.$disconnect();
}, 60_000);

const resourcesListedFor = async (user) => {
  const rows = await listExpiringGrantsForAdmin({ user_id: user.subject_id, within_days: 30 });
  // Rows are grouped by subject and resource, with the resource row hydrated.
  return rows.map((row) => row.resource.id);
};

test('an admin of the parent group sees a grant expiring on the child group\'s dataset', async () => {
  expect(await resourcesListedFor(overseer)).toContain(dataset.resource_id);
});

test('a user with no path to the dataset does not', async () => {
  expect(await resourcesListedFor(outsider)).not.toContain(dataset.resource_id);
});
