/**
 * listRowsArm.test.js
 *
 * The List rows arm: the `_meta` that `decideRows` gives a page of rows, against the detail
 * route's composition for each row alone. The detail route decides `view_metadata` with
 * capabilities and standing, then turns off the capabilities a restriction blocks.
 *
 * `decideRows` reads a page's paths and restrictions in one statement each and seeds every row's
 * check with them, so a row that picked up another row's paths or restrictions shows up here.
 * Each page holds a fragment's own resources and the next two fragments', so a page mixes rows
 * the caller reaches with rows they do not.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Paths replace the first-match role
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const {
  authorizeAction, decideRows, policyRegistry, restrictions, toCapabilitiesArray,
} = require('@/authorization');
const { filterRestrictedCapabilities } = require('@/authorization/core/middlewares');
const { PrismaHydrator } = require('@/authorization/core/hydrators/PrismaHydrator');
const { ANONYMOUS_PRINCIPAL } = require('@/constants');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const tables = modelTablesFrom(policyRegistry);
const PAGE_SPAN = 3;

let written;
let fragments;

beforeAll(async () => {
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  let world;
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

const LOADERS = {
  dataset: (ids) => prisma.dataset.findMany({ where: { resource_id: { in: ids } } }),
  collection: (ids) => prisma.collection.findMany({ where: { id: { in: ids } } }),
  group: (ids) => prisma.group.findMany({ where: { id: { in: ids } } }),
};
const ID_OF = { dataset: (d) => d.resource_id, collection: (c) => c.id, group: (g) => g.id };
const WORLD_ID = { dataset: (f) => f.dataset.id, collection: (f) => f.collection.id, group: (f) => f.owner.id };

async function detailMeta(resourceType, user, id, anonymous) {
  const decision = await authorizeAction(resourceType, 'view_metadata', {
    identifiers: { user, resource: id },
    policyExecutionContext: freshContext(anonymous),
    shouldDeriveCapabilities: true,
    shouldDeriveStanding: true,
  });
  const capabilities = await filterRestrictedCapabilities({
    capabilities: decision.capabilities ?? {},
    resourceType,
    resourceId: id,
    restrictionChecker: restrictions.checkRestriction,
  });
  return {
    capabilities: toCapabilitiesArray(capabilities),
    unrestricted: toCapabilitiesArray(decision.capabilities ?? {}),
    standing: decision.standing ?? [],
  };
}

const canonical = (meta) => JSON.stringify({
  capabilities: [...meta.capabilities].sort(),
  standing: meta.standing.map((p) => JSON.stringify(p)).sort(),
});

test('every list row carries the capabilities and standing its detail route reports', async () => {
  const wrong = [];
  let compared = 0;
  let restricted = 0;
  let unopenable = 0;
  const dbId = (worldId) => written.ids.get(worldId);
  for (const [index, f] of fragments.entries()) {
    const anonymous = f.user.anonymous === true;
    const user = anonymous ? ANONYMOUS_PRINCIPAL.subject_id : dbId(f.user.id);
    const page = fragments.slice(index, index + PAGE_SPAN);
    for (const resourceType of Object.keys(LOADERS)) {
      const ids = [...new Set(page.map((p) => dbId(WORLD_ID[resourceType](p))))];
      const found = await LOADERS[resourceType](ids);
      const rows = ids.map((id) => found.find((row) => ID_OF[resourceType](row) === id));
      const req = {
        user: anonymous ? { ...ANONYMOUS_PRINCIPAL } : { subject_id: user },
        policyContext: freshContext(anonymous),
      };
      const metas = await decideRows(resourceType, rows, { req, idOf: ID_OF[resourceType] });
      for (const [i, id] of ids.entries()) {
        const expected = await detailMeta(resourceType, user, id, anonymous);
        compared += 1;
        if (expected.capabilities.length !== expected.unrestricted.length) restricted += 1;
        if (!expected.capabilities.includes('view_metadata')) unopenable += 1;
        if (canonical(metas[i]) !== canonical(expected)) {
          wrong.push(`cell ${f.index} ${resourceType} row ${i}: `
            + `list ${canonical(metas[i])} detail ${canonical(expected)}`);
        }
      }
    }
  }
  expect(wrong).toEqual([]);
  expect(compared).toBeGreaterThan(300);
  // Forced unless some rows lose a capability to a restriction and some rows do not open.
  expect(restricted).toBeGreaterThan(0);
  expect(unopenable).toBeGreaterThan(0);
}, 600_000);
