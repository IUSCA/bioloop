/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

let runUsers = false;
let runImportSources = false;

function usage() {
  console.log('Usage: node src/scripts/init_prod_data.js [--init-users|-u] [--init-import-sources|-i]');
  console.log('  (no flags) - run both');
}

// Safe default: no flags means initialize both sets of production seed data (users and import sources).
if (args.length === 0) {
  runUsers = true;
  runImportSources = true;
  console.log('No flags provided; defaulting to --init-users and --init-import-sources.');
} else {
  // Explicit mode: one or both flags can be provided to run targeted steps.
  let unknownArg = null;
  args.forEach((arg) => {
    if (arg === '--init-users' || arg === '-u') {
      runUsers = true;
    } else if (arg === '--init-import-sources' || arg === '-i') {
      runImportSources = true;
    } else {
      unknownArg = arg;
    }
  });

  if (unknownArg) {
    console.error(`Unknown option: ${unknownArg}`);
    console.log('');
    usage();
    process.exit(1);
  }
}

function runScript(scriptFileName) {
  const scriptPath = path.join(__dirname, scriptFileName);
  // Fail fast and propagate the child script's exit code so callers can rely
  // on non-zero status for automation/CI checks.
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('=== init_prod_data ===');
console.log(`Users:          ${runUsers}`);
console.log(`Import sources: ${runImportSources}`);
console.log('');

if (runUsers) {
  console.log('--- Initializing users ---');
  runScript('init_prod_users.js');
  console.log('');
}

if (runImportSources) {
  console.log('--- Initializing import sources ---');
  runScript('init_prod_import_sources.js');
  console.log('');
}

console.log('=== Done ===');
