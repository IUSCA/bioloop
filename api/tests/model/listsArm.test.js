/**
 * listsArm.test.js
 *
 * The Lists arm: the dataset list, collection search, and group search against the reference
 * model, for every signed-in user in the covering world who is not a platform admin.
 *
 * A list must contain a cell's resource exactly when the reference finds a path for the
 * action the list declares, `view_metadata`, among the path kinds the list statement reads:
 * `admin`, `oversight`, and `grant`, and `member` for groups. Resource rules such as a public
 * profile admit a page, not a list row, so they are not compared.
 *
 * A deleted dataset is left out of the comparison. Lists exclude it unless asked, as decision
 * 16 row 4 says, and the reference decides reading, not listing.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry } = require('@/authorization');
const { searchDatasetsForUser } = require('@/services/datasets_v2/fetch');
const { searchCollectionsForUser } = require('@/services/collections');
const { searchGroupsForUser } = require('@/services/groups');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const { createReference } = require('./reference');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const tables = modelTablesFrom(policyRegistry);
const LIST_KINDS = {
  dataset: ['admin', 'oversight', 'grant'],
  collection: ['admin', 'oversight', 'grant'],
  group: ['admin', 'oversight', 'grant', 'member'],
};
const EVERYTHING = 100_000;

let written;
let world;
let fragments;

beforeAll(async () => {
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  ({ world, fragments } = W.buildWorld(cells, { now: new Date() }));
  written = await writeWorld(prisma, world);
}, 300_000);

afterAll(async () => {
  if (written) await written.cleanup();
  await prisma.$disconnect();
}, 120_000);

const listed = {
  dataset: async (userId) => (await searchDatasetsForUser({
    user_id: userId,
    filters: {},
    pagination: { offset: 0, limit: EVERYTHING },
    sort: { sort_by: 'name', sort_order: 'asc' },
    includes: {},
  })).data.map((d) => d.resource_id),
  collection: async (userId) => (await searchCollectionsForUser({
    user_id: userId, sort_by: 'name', sort_order: 'asc', limit: EVERYTHING, offset: 0,
  })).data.map((c) => c.id),
  group: async (userId) => (await searchGroupsForUser({
    user_id: userId, sort_by: 'name', sort_order: 'asc', limit: EVERYTHING, offset: 0, scope: 'visible',
  })).data.map((g) => g.id),
};

test('each list holds a resource exactly when the reference finds a listing path to it', async () => {
  const ref = createReference(tables, world);
  const wrong = [];
  const signedIn = fragments.filter((f) => !f.user.anonymous && !f.user.platform_admin);
  for (const f of signedIn) {
    const userId = written.ids.get(f.user.id);
    const resources = [['dataset', f.dataset.id], ['collection', f.collection.id], ['group', f.owner.id]];
    for (const [resourceType, worldId] of resources) {
      if (resourceType === 'dataset' && f.cell.deleted === 'yes') continue; // eslint-disable-line no-continue
      const expected = ref.termPaths(f.user.id, resourceType, 'view_metadata', worldId)
        .some((p) => LIST_KINDS[resourceType].includes(p.kind));
      const ids = await listed[resourceType](userId);
      const actual = ids.includes(written.ids.get(worldId));
      if (actual !== expected) {
        const dims = JSON.stringify(f.cell);
        wrong.push(`cell ${f.index} ${resourceType}: listed ${actual}, reference ${expected}, ${dims}`);
      }
    }
  }
  expect(wrong).toEqual([]);
}, 300_000);
