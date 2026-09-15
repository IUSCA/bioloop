/**
 * restrictionLabels.test.js
 *
 * The archive dialogs list what archiving stops from the actions ARCHIVED blocks, through a
 * table of words in the UI. This reads that table as text and checks it against the restriction
 * layer both ways: every blocked action has words, and no words name an action nothing blocks.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 6: restrictions, operations, and creates
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { restrictions } = require('@/authorization');

const LABELS = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ui', 'src', 'services', 'v2', 'restrictionLabels.js'),
  'utf8',
);
const keys = [...LABELS.matchAll(/^\s*"([a-z_]+\.[a-z_]+)":/gm)].map((m) => m[1]);
const blocked = restrictions.blockedActions('ARCHIVED');

test('every action ARCHIVED blocks has words in the archive dialogs', () => {
  expect(blocked.filter((action) => !keys.includes(action))).toEqual([]);
});

test('the dialogs name no action ARCHIVED does not block', () => {
  expect(keys.filter((action) => !blocked.includes(action))).toEqual([]);
  // Forced unless the table was read: an empty match would pass the check above.
  expect(keys.length).toBeGreaterThan(20);
});
