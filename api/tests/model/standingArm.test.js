/**
 * standingArm.test.js
 *
 * The Standing arm: the paths `authorizeAction` reports with `shouldDeriveStanding`, against the
 * reference model, for every user and every dataset, collection, and group in the covering world.
 *
 * Standing is the set of paths over the container's reading actions. The arm compares the path
 * kinds, and for `member` paths whether the membership is direct, because the badge reads both.
 * A platform admin's standing leads with `platform_admin` and still lists every other path.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — A decision returns its paths
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
const { PrismaHydrator } = require('@/authorization/core/hydrators/PrismaHydrator');
const { ANONYMOUS_PRINCIPAL } = require('@/constants');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const { createReference } = require('./reference');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const tables = modelTablesFrom(policyRegistry);

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

function freshContext(anonymous) {
  const context = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
  if (anonymous) {
    context.cache.user.set(PrismaHydrator.cacheKey('user', ANONYMOUS_PRINCIPAL.subject_id), { ...ANONYMOUS_PRINCIPAL });
  }
  return context;
}

/** A comparable summary of a path list: each kind, and for a member path, whether it is direct. */
const summary = (paths) => [...new Set(paths
  .filter((p) => p.kind !== 'always')
  .map((p) => (p.kind === 'member' ? `member:${p.direct ? 'direct' : 'transitive'}` : p.kind)))].sort();

function referenceStanding(ref, userId, resourceType, resourceId) {
  const paths = [];
  Object.entries(tables.actions[resourceType])
    .filter(([, row]) => row.restriction === 'reading')
    .forEach(([action]) => paths.push(...ref.termPaths(userId, resourceType, action, resourceId)));
  return paths;
}

test('every caller\'s standing names the paths the reference model finds', async () => {
  const ref = createReference(tables, world);
  const wrong = [];
  let compared = 0;
  const kindsSeen = new Set();
  for (const f of fragments) {
    const anonymous = f.user.anonymous === true;
    const user = anonymous ? ANONYMOUS_PRINCIPAL.subject_id : written.ids.get(f.user.id);
    const resources = [['dataset', f.dataset.id], ['collection', f.collection.id], ['group', f.owner.id]];
    for (const [resourceType, worldId] of resources) {
      const result = await authorizeAction(resourceType, 'view_metadata', {
        identifiers: { user, resource: written.ids.get(worldId) },
        policyExecutionContext: freshContext(anonymous),
        shouldDeriveStanding: true,
      });
      const engine = summary(result.standing ?? []);
      const expected = summary(referenceStanding(ref, f.user.id, resourceType, worldId));
      compared += 1;
      engine.forEach((k) => kindsSeen.add(`${resourceType}:${k}`));
      if (engine.join() !== expected.join()) {
        wrong.push(`cell ${f.index} ${resourceType}: engine [${engine}] reference [${expected}]`);
      }
    }
  }
  expect(wrong).toEqual([]);
  expect(compared).toBeGreaterThan(300);
  // The comparison is forced unless the world produces every path a badge reads. A dataset has
  // no member path in standing: its only member term serves `contribute`, which is mutating.
  expect([...kindsSeen].sort()).toEqual(expect.arrayContaining([
    'collection:admin', 'collection:grant', 'collection:oversight', 'collection:platform_admin',
    'collection:resource_rule', 'dataset:admin', 'dataset:grant', 'dataset:oversight',
    'dataset:platform_admin', 'group:admin', 'group:grant', 'group:member:direct',
    'group:member:transitive', 'group:oversight', 'group:platform_admin', 'group:resource_rule',
  ]));
}, 300_000);
