/**
 * sync.test.js
 *
 * The state rules and the policy containers describe the same actions, and nothing keeps them in
 * step but this check. `src/state/index.js` runs it at startup and throws, so a renamed action
 * cannot leave its state rule behind or an action unchecked. This suite asserts the shipped
 * registries agree, and that each kind of disagreement is actually reported.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { policyRegistry, Policy, PolicyContainer } = require('@/authorization');
const {
  stateRegistry, engine, StateContainer, StateRegistry, rule, always, refuse, verifyInSync,
} = require('@/state');

const PolicyRegistry = require('@/authorization/core/policies/PolicyRegistry');

const { findStateGaps } = engine;

const mutatingAction = { policy: Policy.always, restriction: PolicyContainer.RESTRICTION_CLASS.MUTATING };

function policyContainerFor(resourceType, actions) {
  const container = new PolicyContainer({ resourceType });
  actions.forEach((action) => container.action(action, mutatingAction));
  return container;
}

function registryOf(container) {
  const registry = new PolicyRegistry();
  registry.register(container);
  return registry;
}

test('the shipped registries agree', () => {
  expect(findStateGaps(policyRegistry, stateRegistry)).toEqual({
    missingContainers: [],
    missingRules: [],
    phantomRules: [],
  });
});

test('the startup check passes, and it is what src/index.js calls before listening', () => {
  expect(() => verifyInSync()).not.toThrow();
});

test('every policy container has a state container, and the standalone one is extra', () => {
  policyRegistry.listTypes().forEach((resourceType) => {
    expect([resourceType, stateRegistry.has(resourceType)]).toEqual([resourceType, true]);
  });
  // Invitations have state but no policy container, which is what `standalone` declares.
  expect(stateRegistry.has('invitation')).toBe(true);
  expect(policyRegistry.listTypes()).not.toContain('invitation');
  expect(stateRegistry.get('invitation').meta.standalone).toBe(true);
});

test('a policy container with no state container is reported', () => {
  const gaps = findStateGaps(registryOf(policyContainerFor('throwaway', ['edit'])), new StateRegistry());
  expect(gaps.missingContainers).toEqual(['throwaway']);
  expect(gaps.missingRules).toEqual([]);
});

test('an action with no state rule is reported', () => {
  const states = new StateRegistry();
  states.register(new StateContainer({ resourceType: 'throwaway' }).rules({ edit: always }));
  const gaps = findStateGaps(registryOf(policyContainerFor('throwaway', ['edit', 'publish'])), states);
  expect(gaps.missingRules).toEqual(['throwaway.publish']);
  expect(gaps.missingContainers).toEqual([]);
});

test('a state rule naming no action is reported', () => {
  // The shape a rename leaves behind: the container still declares the rule for the old name.
  const states = new StateRegistry();
  states.register(new StateContainer({ resourceType: 'throwaway' })
    .rules({ edit: always, revise: always }));
  const gaps = findStateGaps(registryOf(policyContainerFor('throwaway', ['edit'])), states);
  expect(gaps.phantomRules).toEqual(['throwaway.revise']);
});

test('a whole state container naming no policy container is reported, unless it is standalone', () => {
  const states = new StateRegistry();
  states.register(new StateContainer({ resourceType: 'orphan' }).rules({ edit: always }));
  states.register(new StateContainer({ resourceType: 'aside', standalone: true }).rules({ edit: always }));
  const gaps = findStateGaps(registryOf(policyContainerFor('throwaway', ['edit'])), states);
  expect(gaps.phantomRules).toEqual(['orphan.*']);
});

test('a container refuses a rule that did not come from rule() or always', () => {
  expect(() => new StateContainer({ resourceType: 'throwaway' })
    .rules({ edit: (resource) => (resource.bad ? refuse('no') : null) }))
    .toThrow(/must come from rule\(\) or always/);
});

test('a container is frozen once its rules are declared, and the registry refuses an empty one', () => {
  const container = new StateContainer({ resourceType: 'throwaway' }).rules({ edit: always });
  expect(container.isFrozen()).toBe(true);
  expect(() => container.rules({ publish: always })).toThrow(/frozen/);
  expect(() => new StateRegistry().register(new StateContainer({ resourceType: 'empty' })))
    .toThrow(/declared no rules/);
});

test('asking for an action the container does not declare names where to declare it', () => {
  expect(() => engine.check(stateRegistry, 'group', 'teleport', { is_archived: false }))
    .toThrow(/No state rule for group\.teleport/);
});

test('a rule reads only fields it declares', () => {
  const states = new StateRegistry();
  states.register(new StateContainer({ resourceType: 'throwaway' }).rules({
    edit: rule({
      requires: ['locked'],
      check: (row) => (row.locked ? refuse('Locked.') : null),
    }),
  }));
  expect(engine.check(states, 'throwaway', 'edit', { locked: true }).message).toBe('Locked.');
  expect(engine.check(states, 'throwaway', 'edit', { locked: false })).toBeNull();
  expect(() => engine.check(states, 'throwaway', 'edit', {})).toThrow(/reads locked/);
});
