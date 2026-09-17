/**
 * pathsArm.test.js
 *
 * The Paths arm: `accessPathsQuery` against the reference model, for every user and every
 * dataset, collection, and group in the covering world.
 *
 * For each user and resource it compares three facts, which together are the statement's
 * contract with the engine and the lists.
 *
 * - The path kinds among `admin`, `oversight`, `member`, and `grant`.
 * - The access types the user holds, after widening the grant rows through the implication
 *   closure. For a group, whether any grant row exists.
 * - As a list: the ids `accessibleIdsQuery` returns for the user contain the resource exactly
 *   when the per-resource form found a path.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The rule is a query
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry, accessPathsQuery, accessibleIdsQuery } = require('@/authorization');
const { PUBLIC_GROUP_ID } = require('@/constants');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const { createReference } = require('./reference');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const tables = modelTablesFrom(policyRegistry);

let written;
let world;
let fragments;

/**
 * The reference's path kinds for a resource, over every action, limited to the four SQL kinds.
 * Taken before restrictions and deletion, because the statement records relationships and a
 * restriction blocks actions, not relationships.
 */
function referenceKinds(ref, userId, resourceType, resourceId) {
  const kinds = new Set();
  Object.keys(tables.actions[resourceType]).forEach((action) => {
    ref.termPaths(userId, resourceType, action, resourceId)
      .filter((p) => ['admin', 'oversight', 'member', 'grant'].includes(p.kind))
      .forEach((p) => kinds.add(p.kind));
  });
  return kinds;
}

/** The reflexive, transitive closure of the implication pairs over a set of held types. */
function widen(types) {
  const out = new Set(types);
  const pending = [...types];
  while (pending.length) {
    const from = pending.pop();
    tables.implications
      .filter(([f, to]) => f === from && !out.has(to))
      .forEach(([, to]) => { out.add(to); pending.push(to); });
  }
  return out;
}

beforeAll(async () => {
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  ({ world, fragments } = W.buildWorld(cells, { now: new Date() }));
  written = await writeWorld(prisma, world);
}, 300_000);

afterAll(async () => {
  if (written) await written.cleanup();
  await prisma.$disconnect();
}, 120_000);

test('every user reaches every resource by the paths the reference model names', async () => {
  const ref = createReference(tables, world);
  const wrong = [];
  for (const f of fragments) {
    const userId = f.user.anonymous ? PUBLIC_GROUP_ID : written.ids.get(f.user.id);
    const resources = [['dataset', f.dataset.id], ['collection', f.collection.id], ['group', f.owner.id]];
    for (const [resourceType, worldId] of resources) {
      const dbId = written.ids.get(worldId);
      const rows = await prisma.$queryRaw(accessPathsQuery({ userId, resourceType, resourceIds: [dbId] }));
      const kinds = new Set(rows.map((r) => r.path_kind));
      const expectedKinds = f.user.anonymous
        ? new Set([...referenceKinds(ref, f.user.id, resourceType, worldId)].filter((k) => k === 'grant'))
        : referenceKinds(ref, f.user.id, resourceType, worldId);
      const label = `cell ${f.index} ${resourceType}`;
      if ([...kinds].sort().join() !== [...expectedKinds].sort().join()) {
        wrong.push(`${label}: kinds sql [${[...kinds].sort()}] reference [${[...expectedKinds].sort()}]`);
      }
      if (resourceType !== 'group') {
        const held = widen(rows.filter((r) => r.path_kind === 'grant').map((r) => r.access_type));
        const prefix = resourceType === 'dataset' ? 'DATASET:' : 'COLLECTION:';
        const sqlTypes = [...held].filter((t) => t.startsWith(prefix)).sort();
        const refTypes = [...ref.heldTypes(f.user, resourceType, worldId)]
          .filter((t) => t.startsWith(prefix)).sort();
        if (sqlTypes.join() !== refTypes.join()) {
          wrong.push(`${label}: types sql [${sqlTypes}] reference [${refTypes}]`);
        }
      }

      const listed = await prisma.$queryRaw(accessibleIdsQuery({ userId, resourceType }));
      const inList = listed.some((r) => r.resource_id === dbId);
      if (inList !== rows.length > 0) wrong.push(`${label}: list ${inList}, per-resource ${rows.length > 0}`);
    }
  }
  expect(wrong).toEqual([]);
}, 300_000);
