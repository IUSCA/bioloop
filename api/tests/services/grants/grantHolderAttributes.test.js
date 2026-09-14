/**
 * grantHolderAttributes.test.js
 *
 * What a grant holder receives of a dataset on the detail route, by the access type they
 * hold. Attribute rules short-circuit on the first matching policy, and every dataset access
 * type implies DATASET:VIEW_METADATA. A rule for a wider type therefore only takes effect when
 * it sits above the rule for DATASET:VIEW_METADATA, so this runs the real decision rather than
 * reading the rule list.
 *
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestGrant,
  getAccessTypeId,
  deleteGrantsForResource,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

// `sees` must come back from view_metadata; `withheld` must not.
const CASES = [
  { held: 'DATASET:VIEW_METADATA', sees: [], withheld: ['num_files', 'origin_path', 'staged_path'] },
  { held: 'DATASET:LIST_FILES', sees: ['num_files'], withheld: ['origin_path', 'staged_path'] },
  { held: 'DATASET:DOWNLOAD', sees: ['num_files'], withheld: ['origin_path', 'staged_path'] },
  { held: 'DATASET:VIEW_SENSITIVE_METADATA', sees: ['num_files', 'origin_path', 'staged_path'], withheld: [] },
];

let actor;
let viewer;
let group;
const datasets = [];

beforeAll(async () => {
  actor = await createTestUser('_gha_actor');
  viewer = await createTestUser('_gha_viewer');
  group = await createTestGroup(actor.subject_id, '_gha_group');
}, 30_000);

afterAll(async () => {
  for (const d of datasets) {
    await deleteGrantsForResource(d.resource_id).catch(() => {});
    await deleteDataset(d.id).catch(() => {});
  }
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(viewer.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

describe('a grant holder receives the attributes their access type unlocks', () => {
  test.each(CASES)('$held', async ({ held, sees, withheld }) => {
    const dataset = await createTestDataset(group.id, `_gha_${held.split(':')[1]}`, {
      num_files: 3,
      origin_path: '/origin/gha',
      staged_path: '/staged/gha',
    });
    datasets.push(dataset);
    await createTestGrant({
      subject_id: viewer.subject_id,
      resource_id: dataset.resource_id,
      access_type_id: await getAccessTypeId(held),
      granted_by: actor.subject_id,
    });

    const decision = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: viewer.subject_id, resource: dataset.resource_id },
    });
    expect(decision.granted).toBe(true);
    const seen = decision.filter(dataset);

    expect({
      missing: sees.filter((attr) => !(attr in seen)),
      leaked: withheld.filter((attr) => attr in seen),
    }).toEqual({ missing: [], leaked: [] });
  }, 30_000);
});
