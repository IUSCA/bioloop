/**
 * bootValidation.test.js
 *
 * Configuration errors in the authorization module fail when the module loads, not on the first
 * request that reaches them. Each test here builds one broken piece of configuration and asserts
 * the load-time step that refuses it.
 */

// The misspelled action names are the point of the tests that use them.
// cSpell: ignore veiw contibute

const path = require('path');

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');

const config = require('config');
const Policy = require('@/authorization/core/policies/Policy');
const PolicyContainer = require('@/authorization/core/policies/PolicyContainer');
const PolicyRegistry = require('@/authorization/core/policies/PolicyRegistry');
const { HydratorRegistry } = require('@/authorization/core/hydrators/HydratorRegistry');
const { Hydrator } = require('@/authorization/core/hydrators/BaseHydrator');
const { createDecisionPipeline } = require('@/authorization/core/pipeline');
const { PathRegistry } = require('@/authorization/builtin/paths');
const { compileProjection } = require('@/utils/expression');
const authorization = require('@/authorization');

const ALL = [{ policy: Policy.always, attribute_filters: ['*'] }];
const container = (type = 'thing') => new PolicyContainer({ resourceType: type }).actions({ view: Policy.always });

class StubHydrator extends Hydrator {
  // eslint-disable-next-line class-methods-use-this
  async hydrate() { return {}; }
}

function hydrators({ context = true } = {}) {
  const registry = new HydratorRegistry();
  registry.register('user', new StubHydrator());
  if (context) registry.register('context', new StubHydrator());
  return registry;
}

function policies(...containers) {
  const registry = new PolicyRegistry();
  containers.forEach((c) => registry.register(c.freeze()));
  return registry;
}

describe('a policy container is checked when it is frozen', () => {
  test('a rule keyed by an undeclared action is refused', () => {
    expect(() => container().attributes({ '*': ALL, veiw: ALL }).freeze())
      .toThrow('attribute rules name undeclared actions: veiw');
  });

  test('an action with no rule of its own and no * rule is refused', () => {
    expect(() => container().freeze()).toThrow("actions with no attribute rules and no '*' rule: view");
  });

  test('a malformed attribute path is refused when the rule is registered', () => {
    expect(() => container().attributes({ '*': [{ policy: Policy.always, attribute_filters: ['owner..name'] }] }))
      .toThrow('Invalid attribute path "owner..name"');
    expect(() => compileProjection(['items[0].id'])).toThrow('segment "items[0]" is not a key or key[*]');
  });
});

describe('the path registry is checked when paths register', () => {
  const sql = () => null;

  test('prospective kinds outside the path kinds are refused', () => {
    expect(() => new PathRegistry().register({ resourceType: 'thing', sql, prospectiveKinds: ['owner'] }))
      .toThrow('prospectiveKinds for thing must be a non-empty subset');
  });

  test('paths for a type with no policy container are refused', () => {
    const registry = new PathRegistry();
    registry.register({ resourceType: 'thing', sql });
    expect(() => registry.assertValid(policies(container('other').attributes({ '*': ALL }))))
      .toThrow('paths registered for types with no policy container: thing');
  });

  test('prospective kinds with no group paths are refused', () => {
    const registry = new PathRegistry();
    registry.register({ resourceType: 'thing', sql, prospectiveKinds: ['admin'] });
    expect(() => registry.assertValid(policies(container().attributes({ '*': ALL }))))
      .toThrow('no group paths are registered');
  });
});

describe('the decision pipeline is checked when it is built', () => {
  test('a registry that is not a PolicyRegistry is refused', () => {
    expect(() => createDecisionPipeline({ policyRegistry: { get: () => null }, hydratorRegistry: hydrators() }))
      .toThrow('policyRegistry must be a PolicyRegistry');
  });

  test('a concealed type with no policy container is refused', () => {
    expect(() => createDecisionPipeline({
      policyRegistry: policies(container().attributes({ '*': ALL })),
      hydratorRegistry: hydrators(),
      concealRefusalsWithoutStanding: ['shipment'],
    })).toThrow('concealRefusalsWithoutStanding names unregistered types: shipment');
  });

  test('a missing context hydrator is refused', () => {
    expect(() => createDecisionPipeline({
      policyRegistry: policies(container().attributes({ '*': ALL })),
      hydratorRegistry: hydrators({ context: false }),
    })).toThrow('No hydrator registered for type: context');
  });
});

describe('bound decision helpers are checked when a module binds them', () => {
  test('an unknown type or action is refused at bind time', () => {
    expect(() => authorization.import('shipment')).toThrow('No policies registered for resource type: shipment');
    expect(() => authorization.import('dataset').action('contibute')).toThrow("Action 'contibute' not found");
  });

  test('a list filter needs a list action, and standing needs registered paths', () => {
    expect(() => authorization.import('audit').listFilter()).toThrow("Action 'list' not found");
    expect(() => authorization.import('audit').standingOfRows())
      .toThrow('no paths are registered for resource type audit');
  });

  test('every configured workflow action is a dataset action', () => {
    Object.values(config.get('workflow_policy_actions')).forEach((action) => {
      expect(() => authorization.import('dataset').action(action)).not.toThrow();
    });
  });
});
