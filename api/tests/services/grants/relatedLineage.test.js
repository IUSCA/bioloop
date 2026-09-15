/**
 * relatedLineage.test.js
 *
 * A lineage row is projected by its own decision, not by the decision on the dataset in the URL.
 * An admin of the group that owns a source may see every field of it, and a derivative owned by
 * a group they have no path to shows them only what the dataset list shows every caller.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Projection applied to rows it was not decided for
 * @see tests/services/grants/derivedIndependence.test.js — lineage confers no access
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, projectRows } = require('@/authorization');
const { dataset: DATASET_PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/base_attributes');
const datasetService = require('@/services/datasets_v2');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let sourceAdmin;
let otherAdmin;
let sourceGroup;
let otherGroup;
let source;
let derived;

beforeAll(async () => {
  sourceAdmin = await createTestUser('_rl_source_admin');
  otherAdmin = await createTestUser('_rl_other_admin');
  sourceGroup = await createTestGroup(sourceAdmin.subject_id, '_rl_source');
  otherGroup = await createTestGroup(otherAdmin.subject_id, '_rl_other');
  // Creating a group does not make its creator an admin, so each test admin joins their group.
  await prisma.group_user.createMany({
    data: [
      { group_id: sourceGroup.id, user_id: sourceAdmin.subject_id, role: 'ADMIN' },
      { group_id: otherGroup.id, user_id: otherAdmin.subject_id, role: 'ADMIN' },
    ],
  });
  source = await createTestDataset(sourceGroup.id, '_rl_s');
  derived = await createTestDataset(otherGroup.id, '_rl_d');
  await prisma.dataset_hierarchy.create({ data: { source_id: source.id, derived_id: derived.id } });
}, 30_000);

afterAll(async () => {
  await prisma.dataset_hierarchy.deleteMany({ where: { source_id: source.id } });
  await deleteDataset(derived.id).catch(() => {});
  await deleteDataset(source.id).catch(() => {});
  await deleteGroup(otherGroup.id).catch(() => {});
  await deleteGroup(sourceGroup.id).catch(() => {});
  await deleteUser(otherAdmin.id);
  await deleteUser(sourceAdmin.id);
  await prisma.$disconnect();
}, 30_000);

const context = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

test("a derivative the source's admin cannot open shows only the public attributes", async () => {
  const parent = await authorizeAction('dataset', 'view_derived_datasets', {
    identifiers: { user: sourceAdmin.subject_id, resource: source.resource_id },
    policyExecutionContext: context(),
  });
  expect(parent.granted).toBe(true);

  const { data } = await datasetService.getDerivedDatasets(source.id, { limit: 10, offset: 0 });
  expect(data.map((d) => d.id)).toEqual([derived.id]);
  const [row] = await projectRows('dataset', data, {
    req: { user: { subject_id: sourceAdmin.subject_id }, policyContext: context() },
    idOf: (d) => d.resource_id,
    publicAttributes: DATASET_PUBLIC_ATTRIBUTES,
  });

  const { _meta, ...fields } = row;
  expect(_meta.capabilities).not.toContain('view_metadata');
  const outside = Object.keys(fields).filter((key) => !DATASET_PUBLIC_ATTRIBUTES.includes(key));
  expect(outside).toEqual([]);
  // Forced unless the parent's projection would have shown this row more than the public set.
  const leaked = Object.keys(parent.filter(data[0])).filter((key) => !DATASET_PUBLIC_ATTRIBUTES.includes(key));
  expect(leaked.length).toBeGreaterThan(0);
});

test('a derivative its own admin can open is projected by their decision on it', async () => {
  const { data } = await datasetService.getDerivedDatasets(source.id, { limit: 10, offset: 0 });
  const [row] = await projectRows('dataset', data, {
    req: { user: { subject_id: otherAdmin.subject_id }, policyContext: context() },
    idOf: (d) => d.resource_id,
    publicAttributes: DATASET_PUBLIC_ATTRIBUTES,
  });
  const own = await authorizeAction('dataset', 'view_metadata', {
    identifiers: { user: otherAdmin.subject_id, resource: derived.resource_id },
    policyExecutionContext: context(),
  });

  const { _meta, ...fields } = row;
  expect(_meta.capabilities).toContain('view_metadata');
  expect(JSON.stringify(fields)).toBe(JSON.stringify(own.filter(data[0])));
});
