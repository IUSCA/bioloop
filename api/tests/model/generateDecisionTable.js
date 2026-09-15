/**
 * Writes docs/design/groups/generated/access-decisions.md, or with `--check` fails when the
 * committed file differs from what the reference model produces now.
 *
 *   npm run model:table
 *   npm run model:table -- --check
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { policyRegistry } = require('@/authorization');
const { modelTablesFrom } = require('./tables');
const { renderDecisionTable } = require('./decisionTable');

const OUTPUT = path.join(__dirname, '..', '..', '..', 'docs', 'design', 'groups', 'generated', 'access-decisions.md');

const { markdown, cells, rows } = renderDecisionTable(modelTablesFrom(policyRegistry));

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== markdown) {
    // eslint-disable-next-line no-console
    console.error(`${path.relative(process.cwd(), OUTPUT)} is out of date. Run npm run model:table.`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`access-decisions.md is current (${cells} cells, ${rows} rows)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, markdown);
// eslint-disable-next-line no-console
console.log(`wrote ${path.relative(process.cwd(), OUTPUT)} (${cells} cells, ${rows} rows)`);
process.exit(0);
