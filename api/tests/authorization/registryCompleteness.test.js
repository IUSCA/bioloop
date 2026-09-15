/**
 * registryCompleteness.test.js
 *
 * The facts the access model reads off the registry are total. Every check iterates
 * `policyRegistry.listTypes()`, so a container a derived app registers is covered without
 * editing this file.
 *
 * - Every action declares a restriction class, and the declaration agrees with the
 *   restriction layer's own lists until those lists are derived from it.
 * - Every leaf term says which path kind it confers, or names the rule it is instead.
 * - Every container is frozen.
 * - Every transition row names only states the schema's enum defines.
 * - Every declared requirement is hydratable.
 *
 * Failures name the offending row with the `[label, value]` idiom.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Phase 2: the four tables, the reference model, and worlds
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const { policyRegistry, hydratorRegistry } = require('@/authorization');
const { MUTATING_ACTIONS, READING_ACTIONS } = require('@/authorization/builtin/restrictions');
const {
  buildActionTable, buildTermTable, buildTransitionTable,
} = require('@/authorization/builtin/tables');
const { findUnhydratableRequirements } = require('@/authorization/core/requiresCheck');
const { RESTRICTION_CLASS } = require('@/authorization/core/policies/PolicyContainer');

const PATH_KINDS = ['platform_admin', 'admin', 'oversight', 'member', 'grant', 'resource_rule', 'self'];

const actions = buildActionTable(policyRegistry);

test('the registry holds the seven builtin containers', () => {
  expect(policyRegistry.listTypes()).toEqual(
    expect.arrayContaining(['group', 'collection', 'dataset', 'access_request', 'grant', 'user', 'audit']),
  );
});

test('every action declares a restriction class', () => {
  const unclassified = actions.filter((row) => !row.restriction)
    .map((row) => `${row.resource_type}.${row.action}`);
  expect(unclassified).toEqual([]);
});

test('each declared class agrees with the restriction layer', () => {
  actions.forEach((row) => {
    const qualified = `${row.resource_type}.${row.action}`;
    let listed = 'unlisted';
    if (MUTATING_ACTIONS.has(qualified)) listed = RESTRICTION_CLASS.MUTATING;
    if (READING_ACTIONS.has(qualified)) listed = RESTRICTION_CLASS.READING;
    expect([qualified, row.restriction]).toEqual([qualified, listed]);
  });
});

test('every leaf term names its path kind or its rule', () => {
  buildTermTable(policyRegistry).forEach((row) => {
    const label = `${row.resource_type}:${row.term}`;
    const ok = PATH_KINDS.includes(row.path_kind) || (row.path_kind === null && Boolean(row.rule));
    expect([label, ok]).toEqual([label, true]);
  });
});

test('every container is frozen', () => {
  policyRegistry.listTypes().forEach((type) => {
    expect([type, policyRegistry.get(type).isFrozen()]).toEqual([type, true]);
  });
});

test('every access-request transition names real states', () => {
  const states = new Set(Object.values(ACCESS_REQUEST_STATUS));
  buildTransitionTable(policyRegistry)
    .filter((row) => row.resource_type === 'access_request')
    .forEach((row) => {
      [...row.from, ...row.to].forEach((state) => {
        const label = `${row.action}:${state}`;
        expect([label, states.has(state)]).toEqual([label, true]);
      });
    });
});

test('every action on an access request other than create and read has a transition', () => {
  const stateless = actions
    .filter((row) => row.resource_type === 'access_request' && !row.transition)
    .map((row) => row.action)
    .sort();
  expect(stateless).toEqual(['create', 'read']);
});

test('every declared requirement is hydratable', () => {
  expect(findUnhydratableRequirements(policyRegistry, hydratorRegistry)).toEqual([]);
});
