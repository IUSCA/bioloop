/**
 * refusalStatus.test.js
 *
 * A refusal on a dataset, collection, or group is 404 when the caller holds no standing on it,
 * and 403 when they do. Any other container answers 403. A grant listing names the dataset
 * whose grants it lists, and the grant container's own terms cannot say whether the caller
 * stands on that dataset: a member of the owning group does, and holds no grant-container term.
 *
 * @see docs/design/groups/access-model.md — Refusal shapes
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const {
  createTestUser, createTestGroup, createTestDataset, deleteDataset, deleteGroup, deleteUser,
} = require('../services/helpers');

let admin;
let member;
let stranger;
let group;
let dataset;

const freshContext = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

beforeAll(async () => {
  admin = await createTestUser('_rs_admin');
  member = await createTestUser('_rs_member');
  stranger = await createTestUser('_rs_stranger');
  group = await createTestGroup(admin.subject_id, '_rs_group');
  await prisma.group_user.createMany({
    data: [
      { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
      { group_id: group.id, user_id: member.subject_id, role: 'MEMBER' },
    ],
  });
  dataset = await createTestDataset(group.id, '_rs_dataset');
}, 30_000);

afterAll(async () => {
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  for (const u of [admin, member, stranger]) await deleteUser(u.id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

const listGrants = (user) => authorizeAction('grant', 'list_for_resource', {
  identifiers: { user: user.subject_id, resource: dataset.resource_id },
  policyExecutionContext: freshContext(),
  preFetched: { resource: { resource_id: dataset.resource_id, resource_type: 'DATASET' } },
});

test('a member refused the grant listing of their group\'s dataset is answered 403', async () => {
  const decision = await listGrants(member);
  expect([decision.granted, decision.status]).toEqual([false, 403]);
});

test('the grant listing answers 403 to a stranger too, because grant is not a concealed type', async () => {
  const decision = await listGrants(stranger);
  expect([decision.granted, decision.status]).toEqual([false, 403]);
});

test('a stranger refused an action on a group is answered 404', async () => {
  const decision = await authorizeAction('group', 'invite', {
    identifiers: { user: stranger.subject_id, resource: group.id },
    policyExecutionContext: freshContext(),
  });
  expect([decision.granted, decision.status]).toEqual([false, 404]);
});

test('a member refused an action on their group is answered 403', async () => {
  const decision = await authorizeAction('group', 'invite', {
    identifiers: { user: member.subject_id, resource: group.id },
    policyExecutionContext: freshContext(),
  });
  expect([decision.granted, decision.status]).toEqual([false, 403]);
});

test('the admin control is allowed the grant listing', async () => {
  expect((await listGrants(admin)).granted).toBe(true);
});
