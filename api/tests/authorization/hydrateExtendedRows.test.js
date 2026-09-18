/**
 * hydrateExtendedRows.test.js
 *
 * A list route decides each row with the row itself as the pre-fetched resource. Rows from the
 * extended Prisma client carry computed fields — `grant.is_active`, and
 * `access_request_item.requested_expiry` inside every access request — and `structuredClone`
 * rejects those objects. The hydrator copied pre-fetched rows with it, so
 * `GET /access-requests/requested-by-me` answered 500 for any caller with a request.
 *
 * @see api/src/db.js — result extensions
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { hydratorRegistry } = require('@/authorization');
const {
  createTestUser, createTestGroup, createTestDataset, createTestGrant, getAccessTypeId,
  deleteDataset, deleteGroup, deleteUser, deleteGrants,
} = require('../services/helpers');

let user;
let group;
let dataset;
let grant;

beforeAll(async () => {
  user = await createTestUser('_hx_user');
  group = await createTestGroup(user.subject_id, '_hx_group');
  dataset = await createTestDataset(group.id, '_hx_dataset');
  grant = await createTestGrant({
    subject_id: user.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: await getAccessTypeId('DATASET:VIEW_METADATA'),
    granted_by: user.subject_id,
  });
}, 30_000);

afterAll(async () => {
  await deleteGrants([grant.id]).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(user.id).catch(() => {});
  await prisma.$disconnect();
}, 30_000);

test('a row from the extended client is one structuredClone rejects', async () => {
  const row = await prisma.grant.findUnique({ where: { id: grant.id } });
  expect(() => structuredClone(row)).toThrow();
});

test('the hydrator accepts that row as a pre-fetched resource and keeps its fields', async () => {
  const row = await prisma.grant.findUnique({ where: { id: grant.id } });
  const hydrated = await hydratorRegistry.get('grant').hydrate({
    id: grant.id,
    attributes: ['subject_id', 'resource_id'],
    cache: new Map(),
    preFetched: row,
  });
  expect([hydrated.subject_id, hydrated.resource_id, hydrated.is_active])
    .toEqual([user.subject_id, dataset.resource_id, true]);
});
