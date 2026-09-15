/**
 * policyTree.test.js
 *
 * What the access model needs the core engine to keep.
 *
 * - A combinator keeps its operator and its children, so a compiler can walk `or` into a
 *   UNION instead of holding an opaque closure.
 * - An action declares its restriction class and, for a stateful resource, its transition
 *   row, beside its policy.
 * - The registry lists its types, so a completeness check iterates it instead of a literal list.
 *
 * @see docs/design/groups/access-model-verification-plan.md — What compilation needs from core
 */

const Policy = require('../../../../src/authorization/core/policies/Policy');
const PolicyContainer = require('../../../../src/authorization/core/policies/PolicyContainer');
const PolicyRegistry = require('../../../../src/authorization/core/policies/PolicyRegistry');

const { mutating, reading, RESTRICTION_CLASS } = PolicyContainer;

const term = (name, meta = null) => new Policy({
  name,
  resourceType: 'thing',
  requires: { user: [] },
  meta,
  evaluate: async () => true,
});

describe('a combinator keeps its tree', () => {
  const a = term('a', { pathKind: 'admin' });
  const b = term('b', { pathKind: 'grant', accessType: 'X' });
  const c = term('c');

  test('or, and, and not record their operator and children', () => {
    const p = Policy.or([a, Policy.and([b, Policy.not(c)])]);
    expect(p.operator).toBe('or');
    expect(p.children).toHaveLength(2);
    expect(p.children[1].operator).toBe('and');
    expect(p.children[1].children[1].operator).toBe('not');
    expect(p.children[1].children[1].children[0]).toBe(c);
  });

  test('terms() returns every leaf once, in order', () => {
    const p = Policy.or([a, Policy.and([b, a]), c]);
    expect(p.terms().map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  test('a leaf keeps its meta, frozen', () => {
    expect(b.meta).toEqual({ pathKind: 'grant', accessType: 'X' });
    expect(Object.isFrozen(b.meta)).toBe(true);
  });

  test('renaming on registration keeps the tree and the meta', () => {
    const container = new PolicyContainer({ resourceType: 'thing' });
    container.actions({ view: Policy.or([a, b]) });
    const registered = container.getPolicy('view');
    expect(registered.name).toBe('thing.view');
    expect(registered.operator).toBe('or');
    expect(registered.terms().map((t) => t.meta?.pathKind)).toEqual(['admin', 'grant']);
  });

  test('an unknown operator is refused', () => {
    expect(() => new Policy({
      name: 'x', resourceType: null, requires: { user: [] }, operator: 'xor', evaluate: () => true,
    })).toThrow('operator');
  });
});

describe('an action declares its restriction class and transition', () => {
  const transition = {
    requires: ['status'],
    stateOf: (r) => r.status,
    from: ['DRAFT'],
    to: ['UNDER_REVIEW'],
  };

  test('mutating() and reading() declare a class; a bare policy declares none', () => {
    const container = new PolicyContainer({ resourceType: 'thing' })
      .actions({
        edit: mutating(term('e'), transition),
        view: reading(term('v')),
        legacy: term('l'),
      })
      .freeze();

    expect(container.getRestrictionClass('edit')).toBe(RESTRICTION_CLASS.MUTATING);
    expect(container.getRestrictionClass('view')).toBe(RESTRICTION_CLASS.READING);
    expect(container.getRestrictionClass('legacy')).toBeNull();
    expect(container.getTransition('edit')).toMatchObject({ from: ['DRAFT'], to: ['UNDER_REVIEW'] });
    expect(container.getTransition('view')).toBeNull();
    expect(container.isFrozen()).toBe(true);
  });

  test('asking about an unregistered action throws rather than answering null', () => {
    const container = new PolicyContainer({ resourceType: 'thing' }).actions({ view: reading(term('v')) });
    expect(() => container.getRestrictionClass('nope')).toThrow("Action 'nope' not found");
  });

  test('a malformed transition is refused at registration', () => {
    const container = new PolicyContainer({ resourceType: 'thing' });
    expect(() => container.actions({ edit: mutating(term('e'), { ...transition, from: [] }) }))
      .toThrow('from and to must be non-empty');
    expect(() => container.actions({ edit: { policy: term('e'), restriction: 'sometimes' } }))
      .toThrow('unknown restriction class');
  });
});

describe('the registry lists its types', () => {
  test('in registration order', () => {
    const registry = new PolicyRegistry();
    registry.register(new PolicyContainer({ resourceType: 'b' }));
    registry.register(new PolicyContainer({ resourceType: 'a' }));
    expect(registry.listTypes()).toEqual(['b', 'a']);
  });
});
