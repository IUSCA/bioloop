/**
 * stateLabels.test.js
 *
 * The archive dialogs list what archiving stops, from the actions each resource type's state
 * rules refuse in the archived state, through a table of words in the UI. This reads that table
 * as text and checks it against the state layer both ways: every forbidden action has words, and
 * no words name an action the archived state admits.
 *
 * The dialogs ask the API per resource type, because what a state forbids is the resource's own
 * answer, so this reads the same containers the route reads.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const state = require('@/state');

/** The resource types the two archive dialogs list between them. */
const DIALOG_TYPES = ['group', 'collection', 'dataset', 'grant', 'access_request'];

const LABELS = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ui', 'src', 'services', 'v2', 'restrictionLabels.js'),
  'utf8',
);
const keys = [...LABELS.matchAll(/^\s*"([a-z_]+\.[a-z_]+)":/gm)].map((m) => m[1]);

const forbidden = DIALOG_TYPES.flatMap((resourceType) => state
  .forbiddenActions(resourceType, 'archived')
  .map(({ action }) => `${resourceType}.${action}`));

test('every action the archived state forbids has words in the archive dialogs', () => {
  expect(forbidden.filter((action) => !keys.includes(action))).toEqual([]);
});

test('the dialogs name no action the archived state admits', () => {
  expect(keys.filter((action) => !forbidden.includes(action))).toEqual([]);
  // Forced unless the table was read: an empty match would pass the check above.
  expect(keys.length).toBeGreaterThan(20);
});

test('every dialog resource type answers what archiving forbids', () => {
  DIALOG_TYPES.forEach((resourceType) => {
    const actions = state.forbiddenActions(resourceType, 'archived');
    expect([resourceType, actions.length > 0]).toEqual([resourceType, true]);
    // Each answer carries the message the service would return, so the dialog and the 409
    // cannot drift apart.
    actions.forEach(({ action, message }) => {
      expect([`${resourceType}.${action}`, typeof message]).toEqual([`${resourceType}.${action}`, 'string']);
    });
  });
});
