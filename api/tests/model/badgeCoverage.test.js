/**
 * badgeCoverage.test.js
 *
 * Every path kind a caller's standing can hold has a row in the UI's badge precedence table, and
 * every badge that table names is one `RoleBadge` renders. A kind with no row shows no badge, and
 * a badge name `RoleBadge` does not know renders as the raw word, so both are gaps to report.
 *
 * The UI has no test runner, so this reads the two UI files as text.
 *
 * @see docs/design/groups/access-model.md — The badge vocabulary
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { policyRegistry, PolicyContainer } = require('@/authorization');

const UI = path.join(__dirname, '..', '..', '..', 'ui', 'src');
const precedenceSource = fs.readFileSync(path.join(UI, 'services', 'v2', 'standing.js'), 'utf8');
const roleBadgeSource = fs.readFileSync(path.join(UI, 'components', 'v2', 'RoleBadge.vue'), 'utf8');

/** The rows of BADGE_PRECEDENCE, parsed from `{ kind: "...", direct?: bool, group: ..., resource: ... }`. */
function precedenceRows() {
  const table = precedenceSource.slice(precedenceSource.indexOf('BADGE_PRECEDENCE'));
  const body = table.slice(0, table.indexOf(']);'));
  return [...body.matchAll(/\{([^{}]*)\}/g)].map(([, row]) => {
    const field = (name) => row.match(new RegExp(`${name}:\\s*("?)([A-Za-z_]+)\\1`))?.[2];
    const nullable = (value) => (value === 'null' ? null : value);
    return {
      kind: field('kind'),
      direct: field('direct') === undefined ? undefined : field('direct') === 'true',
      group: nullable(field('group')),
      resource: nullable(field('resource')),
    };
  });
}

/** The path kinds the non-mutating actions of a container can put in standing. */
function standingKinds(resourceType) {
  const container = policyRegistry.get(resourceType);
  const kinds = new Set(['platform_admin']);
  container.getActionNames()
    .filter((action) => container.getRestrictionClass(action) !== PolicyContainer.RESTRICTION_CLASS.MUTATING)
    .forEach((action) => container.getPolicy(action).terms()
      .filter((term) => term.meta?.pathKind)
      .forEach((term) => kinds.add(term.meta.pathKind)));
  return [...kinds].sort();
}

const rows = precedenceRows();

test('the precedence table parses into rows', () => {
  expect(rows.length).toBeGreaterThanOrEqual(6);
  rows.forEach((row) => expect(row.kind).toBeTruthy());
});

test.each(['group', 'dataset', 'collection'])('every path kind in %s standing has a badge row', (resourceType) => {
  const column = resourceType === 'group' ? 'group' : 'resource';
  const missing = [];
  standingKinds(resourceType).forEach((kind) => {
    // A member path is either direct or transitive, and each needs its own row on a group.
    const variants = kind === 'member' ? [true, false] : [undefined];
    variants.forEach((direct) => {
      const row = rows.find((r) => r.kind === kind && (r.direct === undefined || r.direct === direct));
      if (!row || row[column] === null) {
        missing.push(direct === undefined ? kind : `${kind} direct=${direct}`);
      }
    });
  });
  expect(missing).toEqual([]);
});

test('every badge the precedence table names is a role RoleBadge renders', () => {
  const roles = roleBadgeSource.slice(roleBadgeSource.indexOf('const ROLES'));
  const known = new Set([...roles.matchAll(/^ {2}([A-Z_]+):\s*\{/gm)].map(([, name]) => name));
  const named = rows.flatMap((r) => [r.group, r.resource]).filter(Boolean);
  expect(named.filter((name) => !known.has(name))).toEqual([]);
});
