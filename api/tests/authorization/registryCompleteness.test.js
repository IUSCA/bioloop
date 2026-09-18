/**
 * registryCompleteness.test.js
 *
 * The facts the access model reads off the registry are total. Every check iterates
 * `policyRegistry.listTypes()`, so a container a derived app registers is covered without
 * editing this file.
 *
 * - Every action declares a restriction class, which is what the restriction layer reads.
 * - Every leaf term says which path kind it confers, or names the rule it is instead.
 * - Every container is frozen.
 * - Every transition row names only states the schema's enum defines.
 * - Every declared requirement is hydratable.
 *
 * Failures name the offending row with the `[label, value]` idiom.
 *
 * @see docs/design/groups/access-model.md — Extension
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const { policyRegistry, hydratorRegistry } = require('@/authorization');
const state = require('@/state');
const {
  buildActionTable, buildTermTable,
} = require('@/authorization/builtin/tables');
const { findUnhydratableRequirements } = require('@/authorization/core/requiresCheck');
const { datasetResource, userSubject } = require('../state/rows');

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

// Which statuses admit which action is the resource's own business logic, so these read the
// state container rather than a table beside the policies.
// @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization

test('the access-request rules speak about real statuses, and only real ones', () => {
  // A rule that named a status the enum does not hold would refuse forever without saying so.
  // Every real status is answered, and each answer is a decision rather than a throw.
  const resource = datasetResource();
  const subject = userSubject();
  Object.values(ACCESS_REQUEST_STATUS).forEach((status) => {
    state.stateRegistry.get('access_request').getActionNames().forEach((action) => {
      const label = `${action}:${status}`;
      expect([label, typeof state.checkOf('access_request', action, { status, resource, subject })])
        .toEqual([label, 'object']);
    });
  });
});

test('every action on an access request other than create and read reads its status', () => {
  const stateless = state.stateRegistry.get('access_request').getActionNames()
    .filter((action) => !state.requiredFieldsOf('access_request', [action]).includes('status'))
    .sort();
  expect(stateless).toEqual(['create', 'read']);
});

test('a status the request is not in refuses the step, and the one it is in admits it', () => {
  // Forced unless the rules discriminate: a container that admitted everything would pass the
  // two checks above.
  const resource = datasetResource();
  const subject = userSubject();
  expect(state.checkOf('access_request', 'submit', { status: 'DRAFT', resource, subject })).toBeNull();
  expect(state.checkOf('access_request', 'submit', { status: 'APPROVED', resource, subject })).not.toBeNull();
});

test('every declared requirement is hydratable', () => {
  expect(findUnhydratableRequirements(policyRegistry, hydratorRegistry)).toEqual([]);
});
