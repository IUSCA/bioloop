/**
 * isActive.test.js
 *
 * `is_active` on a grant row answers what membership in `valid_grants` answers. The Prisma
 * extension computes it for ORM rows and `isGrantActive` for raw rows, and both must agree with
 * the view for a grant that is in force, revoked, expired, not yet started, and bounded.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The UI layer
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { Prisma } = require('@prisma/client');

const prisma = require('@/db');
const { isGrantActive } = require('@/utils/grantValidity');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  getAccessTypeId,
  deleteGrantsForResource,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);

// Each grant sits on its own dataset, so no two cases collide on subject, resource, and type.
const CASES = [
  { label: 'in force', fields: {} },
  { label: 'revoked', fields: { revoked_at: ago(1) } },
  { label: 'expired', fields: { valid_from: ago(3), valid_until: ago(1) } },
  { label: 'not yet started', fields: { valid_from: ago(-2) } },
  { label: 'bounded and in force', fields: { valid_until: ago(-2) } },
];

let actor;
let group;
const datasets = [];
const grants = [];

beforeAll(async () => {
  actor = await createTestUser('_active_actor');
  group = await createTestGroup(actor.subject_id, '_active_group');
  const accessTypeId = await getAccessTypeId('DATASET:VIEW_METADATA');
  for (const [index, { label, fields }] of CASES.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const dataset = await createTestDataset(group.id, `_active_${index}`);
    datasets.push(dataset);
    // eslint-disable-next-line no-await-in-loop
    const grant = await prisma.grant.create({
      data: {
        subject_id: actor.subject_id,
        resource_id: dataset.resource_id,
        access_type_id: accessTypeId,
        granted_by: actor.subject_id,
        creation_type: 'MANUAL',
        ...fields,
      },
    });
    grants.push({ label, id: grant.id });
  }
}, 30_000);

afterAll(async () => {
  for (const d of datasets) {
    // eslint-disable-next-line no-await-in-loop
    await deleteGrantsForResource(d.resource_id).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await deleteDataset(d.id).catch(() => {});
  }
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

test('is_active agrees with valid_grants for every grant state', async () => {
  const ids = grants.map((g) => g.id);
  const inView = new Set((await prisma.$queryRaw(Prisma.sql`
    SELECT id FROM valid_grants WHERE id IN (${Prisma.join(ids)})
  `)).map((r) => r.id));
  const ormRows = await prisma.grant.findMany({ where: { id: { in: ids } } });
  // Named columns: `SELECT *` includes a tsrange column the raw client cannot read.
  const rawRows = await prisma.$queryRaw(Prisma.sql`
    SELECT id, valid_from, valid_until, revoked_at FROM "grant" WHERE id IN (${Prisma.join(ids)})
  `);

  const expected = grants.map(({ label, id }) => [label, inView.has(id)]);
  expect(grants.map(({ label, id }) => [label, ormRows.find((r) => r.id === id).is_active])).toEqual(expected);
  expect(grants.map(({ label, id }) => [label, isGrantActive(rawRows.find((r) => r.id === id))])).toEqual(expected);

  // Forced unless the cases put grants on both sides of the view.
  expect(new Set(expected.map(([, active]) => active))).toEqual(new Set([true, false]));
});
