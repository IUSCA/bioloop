/**
 * asyncTerms.test.js
 *
 * A term decides from the attributes it declares. An async `evaluate` means the term reads the
 * database itself, so its `requires` understates what it reads and no compiler can turn it
 * into SQL. `findAsyncTerms` lists every such term in the registry, and the authorization
 * module refuses to load while the list is not empty.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 4: the rule becomes a query
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { policyRegistry } = require('@/authorization');
const Policy = require('@/authorization/core/policies/Policy');
const { findAsyncTerms } = require('@/authorization/core/requiresCheck');

test('no registered term reads the database from evaluate', () => {
  expect(findAsyncTerms(policyRegistry)).toEqual([]);
});

test('the check sees an async evaluate inside a combinator', () => {
  const reads = new Policy({
    name: 'readsTheDatabase', resourceType: 'dataset', requires: { user: [] }, evaluate: async () => true,
  });
  const registry = {
    listTypes: () => ['dataset'],
    get: () => ({
      getActionNames: () => ['view_metadata'],
      getPolicy: () => Policy.or([Policy.never, reads]),
      export: () => ({ attributeRules: {} }),
    }),
  };
  expect(findAsyncTerms(registry)).toEqual(['dataset.view_metadata (readsTheDatabase)']);
});
