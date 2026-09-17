/**
 * listRowsArm.test.js
 *
 * The List rows arm: the `_meta` that `decideRows` gives a page of rows, against the detail
 * route's composition for each row alone. The detail route decides `view_metadata` with
 * capabilities and standing, then turns off the capabilities a restriction blocks.
 *
 * `decideRows` reads a page's paths in one statement and seeds every row's check with them, so a
 * row that picked up another row's paths shows up here. Each page holds a fragment's own
 * resources and the next two fragments', so a page mixes rows the caller reaches with rows they
 * do not.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const {
  authorizeAction, decideRows, evaluateCapabilitySet, hydratorRegistry, policyRegistry, toCapabilitiesArray,
} = require('@/authorization');
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
  const identifiers = { user, resource: id };
  const decision = await authorizeAction(resourceType, 'view_metadata', {
    identifiers,
    policyExecutionContext: freshContext(anonymous),
    shouldDeriveCapabilities: true,
    shouldDeriveStanding: true,
  });
  // What the action policies alone allow, before any restriction, for the forcing count below.
  const unrestricted = decision.granted ? await evaluateCapabilitySet({
    policyContainer: policyRegistry.get(resourceType),
    identifiers,
    hydratorRegistry,
    policyExecutionContext: freshContext(anonymous),
  }) : {};
  return {
    capabilities: toCapabilitiesArray(decision.capabilities ?? {}),
    unrestricted: toCapabilitiesArray(unrestricted),
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
        if (expected.unrestricted.some((a) => !expected.capabilities.includes(a))) restricted += 1;
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
  // Forced unless some rows do not open: a page whose every row the caller could read would
  // compare the batch against itself.
  expect(unopenable).toBeGreaterThan(0);

  // `restricted` counts rows that lose a capability to a restriction, and it is 0 by
  // construction: the builtin checker allows every action, so no world can produce one. It was
  // a forcing check until the restriction layer stopped blocking, and asserting it now would
  // fail on data that cannot contain the case. The property it guarded — that a blocking
  // checker removes a capability from a row — is tested with an injected checker in
  // `tests/authorization/restrictionSeam.test.js`.
  expect(restricted).toBe(0);
}, 600_000);
