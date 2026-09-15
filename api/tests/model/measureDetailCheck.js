/**
 * Measures what one detail-page authorization costs: the number of database queries and the
 * latency of `authorizeAction('dataset', 'view_metadata')` with capabilities derived, for every
 * signed-in user in the covering world.
 *
 *   node tests/model/measureDetailCheck.js
 *
 * Queries are counted by wrapping the Prisma client's raw-query methods and every model method
 * the engine can call, because the server does not load pg_stat_statements.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 4: the rule becomes a query
 */

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax, no-param-reassign */

const path = require('path');

require('../testDatabase');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

let queries = 0;
const wrap = (target, name) => {
  const original = target[name];
  if (typeof original !== 'function') return;
  target[name] = function counted(...args) {
    queries += 1;
    return original.apply(this, args);
  };
};
['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].forEach((m) => wrap(prisma, m));
Prisma.dmmf.datamodel.models.forEach(({ name }) => {
  const delegate = prisma[name];
  if (!delegate) return;
  ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count']
    .forEach((m) => wrap(delegate, m));
});

const { policyRegistry, authorizeAction } = require('@/authorization');

const { modelTablesFrom } = require('./tables');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  modelTablesFrom(policyRegistry);
  const cells = W.allPairs();
  const { world, fragments } = W.buildWorld(cells, { now: new Date() });
  const written = await writeWorld(prisma, world);
  try {
    const counts = [];
    const millis = [];
    for (const f of fragments.filter((frag) => !frag.user.anonymous && !frag.user.platform_admin)) {
      const context = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
      queries = 0;
      const t0 = process.hrtime.bigint();
      await authorizeAction('dataset', 'view_metadata', {
        identifiers: { user: written.ids.get(f.user.id), resource: written.ids.get(f.dataset.id) },
        policyExecutionContext: context,
        shouldDeriveCapabilities: true,
      });
      millis.push(Number(process.hrtime.bigint() - t0) / 1e6);
      counts.push(queries);
    }
    const p90 = [...millis].sort((a, b) => a - b)[Math.floor(millis.length * 0.9)];
    console.log(`MEASURE checks=${counts.length} median_queries=${median(counts)} max_queries=${Math.max(...counts)} `
      + `median_ms=${median(millis).toFixed(1)} p90_ms=${p90.toFixed(1)}`);
  } finally {
    await written.cleanup();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
