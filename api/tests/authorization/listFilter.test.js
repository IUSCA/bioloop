/**
 * listFilter.test.js
 *
 * A list row is projected by the caller's `list` decision, not by a decision on the row. Every
 * caller except a platform admin sees the list's attributes on every row, including rows they
 * administer, and sees more only on the detail route. This pins that, so a per-row projection
 * cannot come back unnoticed.
 *
 * A group search row still carries the caller's standing for its badge. `standingOfRows` reads it
 * from one path statement for the page, and it must match the paths the detail route reports.
 *
 * @see docs/design/groups/access-model.md — Projection
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, listFilter, standingOfRows } = require('@/authorization');
const { dataset: DATASET_PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/base_attributes');
const datasetService = require('@/services/datasets_v2');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../services/helpers');

let platformAdmin;
let caller;
let adminGroup;
let memberGroup;
let otherGroup;
let dataset;

beforeAll(async () => {
  platformAdmin = await createTestUser('_plr_platform');
  // createTestUser assigns no roles, and the platform-admin check reads user_role.
  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: adminRole.id } });

  caller = await createTestUser('_plr_caller');
  adminGroup = await createTestGroup(caller.subject_id, '_plr_admin');
  memberGroup = await createTestGroup(caller.subject_id, '_plr_member');
  otherGroup = await createTestGroup(caller.subject_id, '_plr_other');
  // Creating a group does not make its creator a member, so the memberships are written here.
  await prisma.group_user.createMany({
    data: [
      { group_id: adminGroup.id, user_id: caller.subject_id, role: 'ADMIN' },
      { group_id: memberGroup.id, user_id: caller.subject_id, role: 'MEMBER' },
    ],
  });
  dataset = await createTestDataset(adminGroup.id, '_plr_ds');
}, 30_000);

afterAll(async () => {
  await deleteDataset(dataset.id).catch(() => {});
  for (const g of [adminGroup, memberGroup, otherGroup]) await deleteGroup(g.id).catch(() => {});
  await deleteUser(caller.id);
  await deleteUser(platformAdmin.id);
  await prisma.$disconnect();
}, 30_000);

const requestFor = (user) => ({
  user: { subject_id: user.subject_id },
  policyContext: { cache: { user: new Map(), resource: new Map(), context: new Map() } },
});

const topLevel = (attributes) => new Set(attributes.map((attribute) => attribute.split('.')[0]));

describe('listFilter', () => {
  test('an admin of the owning group sees only the public attributes on a list row', async () => {
    const row = await datasetService.getDatasetById(dataset.resource_id, { includes: { owner_group: true } });
    // Forced unless the fetched row carries fields the public list leaves out.
    const allowed = topLevel(DATASET_PUBLIC_ATTRIBUTES);
    expect(Object.keys(row).filter((key) => !allowed.has(key)).length).toBeGreaterThan(0);

    // The caller could read every field of this dataset on its detail route.
    const detail = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: caller.subject_id, resource: dataset.resource_id },
      policyExecutionContext: requestFor(caller).policyContext,
    });
    expect(detail.granted).toBe(true);

    const listed = (await listFilter(requestFor(caller), 'dataset'))(row);
    expect(Object.keys(listed).filter((key) => !allowed.has(key))).toEqual([]);
  });

  test('a platform admin sees every field', async () => {
    const row = await datasetService.getDatasetById(dataset.resource_id, { includes: { owner_group: true } });
    const listed = (await listFilter(requestFor(platformAdmin), 'dataset'))(row);
    expect(listed).toEqual(row);
  });
});

describe('standingOfRows', () => {
  const ids = () => [adminGroup.id, memberGroup.id, otherGroup.id];

  test('each row carries the path the caller holds to that group, in row order', async () => {
    const [onAdmin, onMember, onOther] = await standingOfRows(requestFor(caller), 'group', ids());
    expect(onAdmin).toContainEqual({ kind: 'admin', group_id: adminGroup.id });
    expect(onMember).toContainEqual({ kind: 'member', group_id: memberGroup.id, direct: true });
    expect(onOther).toEqual([]);
  });

  test('the standing matches the path rows the detail route reports', async () => {
    const standings = await standingOfRows(requestFor(caller), 'group', ids());
    for (const [index, id] of ids().entries()) {
      // eslint-disable-next-line no-await-in-loop
      const detail = await authorizeAction('group', 'view_metadata', {
        identifiers: { user: caller.subject_id, resource: id },
        policyExecutionContext: requestFor(caller).policyContext,
        shouldDeriveStanding: true,
      });
      const pathRows = (detail.standing ?? [])
        .filter((p) => !['platform_admin', 'resource_rule'].includes(p.kind));
      const sorted = (list) => list.map((p) => JSON.stringify(p)).sort();
      expect([id, sorted(standings[index])]).toEqual([id, sorted(pathRows)]);
    }
  });

  test('an anonymous caller has no standing on any row', async () => {
    const standings = await standingOfRows({ user: { subject_id: 'x', is_anonymous: true } }, 'group', ids());
    expect(standings).toEqual([[], [], []]);
  });
});
