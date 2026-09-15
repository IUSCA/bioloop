/**
 * nullIdHydration.test.js
 *
 * A create names its owning group in the pre-fetched resource and has no resource id. Two such
 * decisions in one request share a policy context, as the bulk create route and the
 * eligible-owner-groups list do. Each must be decided on its own owning group: a cached record
 * keyed by the missing id would answer the second with the first one's attributes.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Phase 6: restrictions, operations, and creates
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, hydratorRegistry } = require('@/authorization');
const {
  createTestUser, createTestGroup, deleteGroup, deleteUser,
} = require('../services/helpers');

let admin;
let administered;
let other;

beforeAll(async () => {
  admin = await createTestUser('_nid_admin');
  administered = await createTestGroup(admin.subject_id, '_nid_mine');
  other = await createTestGroup(admin.subject_id, '_nid_other');
  await prisma.group_user.create({ data: { group_id: administered.id, user_id: admin.subject_id, role: 'ADMIN' } });
}, 30_000);

afterAll(async () => {
  await deleteGroup(other.id).catch(() => {});
  await deleteGroup(administered.id).catch(() => {});
  await deleteUser(admin.id);
  await prisma.$disconnect();
}, 30_000);

test('a record with no id is not shared between hydrations', async () => {
  const hydrator = hydratorRegistry.get('dataset');
  const cache = new Map();
  const first = await hydrator.hydrate({
    id: null, attributes: ['owner_group_id'], cache, preFetched: { owner_group_id: 'first' },
  });
  const second = await hydrator.hydrate({
    id: null, attributes: ['owner_group_id'], cache, preFetched: { owner_group_id: 'second' },
  });
  expect(first.owner_group_id).toBe('first');
  expect(second.owner_group_id).toBe('second');
});

test('two creates in one policy context are each decided on their own owning group', async () => {
  const policyExecutionContext = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
  const decide = (owner_group_id) => authorizeAction('dataset', 'create', {
    identifiers: { user: admin.subject_id, resource: null },
    policyExecutionContext,
    preFetched: { resource: { owner_group_id } },
  });
  // The administered group first, so a shared record would carry its id into the second call.
  expect((await decide(administered.id)).granted).toBe(true);
  expect((await decide(other.id)).granted).toBe(false);
});
