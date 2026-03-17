/* eslint-disable no-console */
require('module-alias/register');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { readFromJSON } = require('../utils');

global.__basedir = path.join(__dirname, '..', '..');

/*
 * Import sources are read from import_sources.json in the api/ root directory.
 * The file must be a JSON array of objects with at least a "path" field.
 *
 * Example import_sources.json:
 *
 * [
 *   {
 *     "path": "/N/slate/bioloop/imports",
 *     "label": "Slate Imports"
 *   }
 *   {
 *     "path": "/N/project/bioloop/imports",
 *     "label": "Project Imports",
 *     "description": "Shared project filesystem import entrypoint",
 *     "sort_order": 1
 *   },
 *   {
 *     "path": "/N/scratch/bioloop/imports",
 *     "label": "Scratch Imports",
 *     "description": "Scratch filesystem import entrypoint",
 *     "sort_order": 2
 *   }
 * ]
 *
 * Fields:
 *   path         (required) — absolute path on the filesystem; must be unique across all sources
 *   label        (optional) — human-readable name shown in the UI dropdown
 *   description  (optional) — longer description of this source
 *   sort_order   (optional) — integer; lower values appear first; omit or set null to sort last
 */

const prisma = new PrismaClient();

async function main() {
  const importSources = readFromJSON('import_sources.json');

  if (importSources.length === 0) {
    console.log('No import sources found in import_sources.json. Nothing to do.');
    return;
  }

  const missing = importSources.filter((s) => !s.path);
  if (missing.length > 0) {
    console.error(`${missing.length} import source(s) are missing the required "path" field. Aborting.`);
    process.exit(1);
  }

  await Promise.all(
    importSources.map((source) => prisma.import_source.upsert({
      where: { path: source.path },
      create: source,
      update: {
        label: source.label ?? null,
        description: source.description ?? null,
        sort_order: source.sort_order ?? null,
      },
    })),
  );

  console.log(`created/updated ${importSources.length} import source(s)`);
}

main()
  .then(() => {
    prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
