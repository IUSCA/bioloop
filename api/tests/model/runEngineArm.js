/**
 * Writes the covering world into the test database, runs the Engine arm, prints the
 * disagreements grouped by action, and removes the world.
 *
 *   node tests/model/runEngineArm.js [report.json]
 *
 * @see tests/model/engineArm.js
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

require('../testDatabase');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry } = require('@/authorization');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');
const { runEngineArm, summarize } = require('./engineArm');

async function main() {
  const tables = modelTablesFrom(policyRegistry);
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  const { world, fragments } = W.buildWorld(cells, { now: new Date() });

  const started = Date.now();
  const written = await writeWorld(prisma, world);
  console.log(`wrote world ${written.tag}: ${cells.length} cells in ${Date.now() - started} ms`);
  try {
    const t0 = Date.now();
    const { decisions, disagreements } = await runEngineArm({
      tables, world, fragments, ids: written.ids,
    });
    console.log(`engine arm: ${decisions} decisions, ${disagreements.length} disagreements, ${Date.now() - t0} ms`);
    summarize(disagreements).forEach((g) => {
      console.log(`\n[${g.count}] ${g.key}\n  shared: ${g.shared.join(', ') || '(none)'}`);
      console.log(`  example cell ${g.example.cell}: ${JSON.stringify(g.example.dims)}`);
      console.log(`  reference: ${JSON.stringify(g.example.reference)}`);
    });
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(disagreements, null, 2));
  } finally {
    await written.cleanup();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
