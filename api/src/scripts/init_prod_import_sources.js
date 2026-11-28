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
 *     "path": "/data/bioloop/genomics",
 *     "label": "Genomics Lab Drops",
 *     "description": "Instrument drop directory for the genomics lab",
 *     "sort_order": 1
 *   },
 *   {
 *     "path": "/data/bioloop/proteomics",
 *     "label": "Proteomics Lab Drops",
 *     "description": "Instrument drop directory for the proteomics lab",
 *     "sort_order": 2,
 *     "mounted_path": "/opt/sca/imports/proteomics"
 *   }
 * ]
 *
 * Fields:
 *   path           (required) — canonical absolute path shown in the UI and stored in the
 *                               database; must be unique across all sources
 *   label          (optional) — human-readable name shown in the UI dropdown
 *   description    (optional) — longer description of this source
 *   sort_order     (optional) — integer; lower values appear first; omit or set null to sort last
 *   mounted_path   (optional) — the path at which this source is accessible to the API
 *                               process, when it differs from `path`.  Leave null/omit when
 *                               the canonical path and the local mount point are the same.
 *                               Must match the mount-point-side path in the volume mount
 *                               for the api service.
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
        mounted_path: source.mounted_path ?? null,
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
