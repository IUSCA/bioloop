/* eslint-disable no-console */
/**
 * Confirm every import source's path is still readable.
 *
 * Run on a schedule. A source whose path has gone away is suspended with a reason, so the
 * dialog says the source is unavailable instead of showing an empty directory. One that
 * comes back is restored.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B1a
 */
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { verifyImportSourcePaths } = require('@/services/import_sources');

async function main() {
  const { checked, suspended, restored } = await verifyImportSourcePaths();
  console.log(`checked ${checked} import source(s)`);
  if (suspended.length) console.log(`suspended: ${suspended.join(', ')}`);
  if (restored.length) console.log(`restored: ${restored.join(', ')}`);
  if (!suspended.length && !restored.length) console.log('no changes');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
