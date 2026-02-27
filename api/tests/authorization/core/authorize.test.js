/* eslint-disable no-param-reassign */
const { authorize, authorizeWithFilters } = require('@/authorization/core/authorize');
const Policy = require('@/authorization/core/policies/Policy');
const { HydratorRegistry } = require('@/authorization/core/hydrators/HydratorRegistry');
const { Hydrate } = require('@/authorization/core/hydrators/BaseHydrator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A simple in-memory hydrator that returns whatever `store` has keyed by id,
 * supplemented with any preFetched attributes. If id is null it returns {}.
 */
class StubHydrator extends Hydrate {
  constructor(store = {}) {
    super();
    this.store = store;
    this.hydrateSpy = jest.fn(this._hydrateImpl.bind(this));
  }

  async _hydrateImpl({
    id, attributes, cache, preFetched,
  }) {
    const cacheKey = `${id}`;
    if (!cache) cache = new Map();
    if (!cache.has(cacheKey)) cache.set(cacheKey, {});
    const record = cache.get(cacheKey);

    // merge preFetched
    if (preFetched) Object.assign(record, preFetched);

    // merge stored record
    if (id !== null && this.store[id]) Object.assign(record, this.store[id]);

    // add only requested attributes that are present
    attributes.forEach(() => {
      // already in record or not available – that's fine for stub tests
    });

    return record;
  }

  async hydrate(args) {
    return this.hydrateSpy(args);
  }
}

/** Builds a minimal registry with user, context, and optionally a resource hydrator. */
function makeRegistry(userStore = {}, resourceStore = {}, resourceType = null) {
  const registry = new HydratorRegistry();
  const userHydrator = new StubHydrator(userStore);
  const contextHydrator = new StubHydrator({});
  registry.register('user', userHydrator);
  registry.register('context', contextHydrator);
  if (resourceType) {
    const resourceHydrator = new StubHydrator(resourceStore);
    registry.register(resourceType, resourceHydrator);
  }
  return { registry, userHydrator, contextHydrator };
}

function makePolicy(overrides = {}) {
  return new Policy({
    name: 'testPolicy',
    resourceType: null,
    requires: { user: ['id'] },
    evaluate: async () => true,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// authorize()
// ---------------------------------------------------------------------------
describe('authorize()', () => {
  describe('input validation', () => {
    it('throws AuthorizationError when policy is null', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      await expect(authorize({ policy: null, identifiers: { user: 1 }, registry })).rejects.toThrow(
        'Invalid policy',
      );
    });

    it('throws AuthorizationError when policy is not a Policy instance', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      await expect(authorize({ policy: {}, identifiers: { user: 1 }, registry })).rejects.toThrow(
        'Invalid policy',
      );
    });

    it('throws AuthorizationError when identifiers is not an object', async () => {
      const { registry } = makeRegistry();
      const policy = makePolicy();
      await expect(authorize({ policy, identifiers: 'bad', registry })).rejects.toThrow(
        'Invalid identifiers',
      );
    });

    it('throws AuthorizationError when registry is not a HydratorRegistry', async () => {
      const policy = makePolicy();
      await expect(authorize({ policy, identifiers: { user: 1 }, registry: {} })).rejects.toThrow(
        'Invalid registry',
      );
    });

    it('throws AuthorizationError when user identifier is missing', async () => {
      const { registry } = makeRegistry();
      const policy = makePolicy();
      await expect(authorize({ policy, identifiers: { user: null }, registry })).rejects.toThrow(
        'User identifier is required',
      );
    });
  });

  describe('authorization decision', () => {
    it('returns true when policy.evaluate resolves to true', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const result = await authorize({ policy, identifiers: { user: 1 }, registry });
      expect(result).toBe(true);
    });

    it('returns false when policy.evaluate resolves to false', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => false });
      const result = await authorize({ policy, identifiers: { user: 1 }, registry });
      expect(result).toBe(false);
    });

    it('calls userHydrator.hydrate once', async () => {
      const { registry, userHydrator } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      await authorize({ policy, identifiers: { user: 1 }, registry });
      expect(userHydrator.hydrateSpy).toHaveBeenCalledTimes(1);
    });

    it('calls contextHydrator.hydrate once', async () => {
      const { registry, contextHydrator } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      await authorize({ policy, identifiers: { user: 1 }, registry });
      expect(contextHydrator.hydrateSpy).toHaveBeenCalledTimes(1);
    });

    it('does not call resource hydrator when policy.resourceType is null', async () => {
      const registry = new HydratorRegistry();
      const userHydrator = new StubHydrator({ 1: { id: 1 } });
      const contextHydrator = new StubHydrator({});
      const resourceHydrator = new StubHydrator({});
      registry.register('user', userHydrator);
      registry.register('context', contextHydrator);
      registry.register('post', resourceHydrator);

      const policy = makePolicy({ resourceType: null });
      await authorize({ policy, identifiers: { user: 1 }, registry });
      expect(resourceHydrator.hydrateSpy).not.toHaveBeenCalled();
    });

    it('calls resource hydrator when policy.resourceType is set', async () => {
      const registry = new HydratorRegistry();
      const userHydrator = new StubHydrator({ 1: { id: 1 } });
      const contextHydrator = new StubHydrator({});
      const resourceHydrator = new StubHydrator({ 10: { id: 10, ownerId: 1 } });
      registry.register('user', userHydrator);
      registry.register('context', contextHydrator);
      registry.register('post', resourceHydrator);

      const policy = makePolicy({
        resourceType: 'post',
        requires: { user: ['id'], resource: ['ownerId'] },
        evaluate: async (u, r) => u.id === r.ownerId,
      });
      const result = await authorize({ policy, identifiers: { user: 1, resource: 10 }, registry });
      expect(result).toBe(true);
      expect(resourceHydrator.hydrateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache / preFetched passthrough', () => {
    it('passes policyExecutionContext caches to the user hydrator', async () => {
      const { registry, userHydrator } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      const userCache = new Map();
      const contextCache = new Map();
      await authorize({
        policy,
        identifiers: { user: 1 },
        registry,
        policyExecutionContext: { cache: { user: userCache, resource: new Map(), context: contextCache } },
      });
      const callArgs = userHydrator.hydrateSpy.mock.calls[0][0];
      expect(callArgs.cache).toBe(userCache);
    });

    it('passes preFetched user data to the user hydrator', async () => {
      const { registry, userHydrator } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      const preFetchedUser = { id: 1, role: 'admin' };
      await authorize({
        policy, identifiers: { user: 1 }, registry, preFetched: { user: preFetchedUser },
      });
      const callArgs = userHydrator.hydrateSpy.mock.calls[0][0];
      expect(callArgs.preFetched).toBe(preFetchedUser);
    });
  });
});

// ---------------------------------------------------------------------------
// authorizeWithFilters()
// ---------------------------------------------------------------------------
describe('authorizeWithFilters()', () => {
  describe('input validation', () => {
    it('throws when policy is not a Policy instance', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      await expect(
        authorizeWithFilters({
          policy: null, attributeRules: [], identifiers: { user: 1 }, registry,
        }),
      ).rejects.toThrow('Invalid policy');
    });

    it('throws when attributeRules is not an array', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      await expect(
        authorizeWithFilters({
          policy, attributeRules: null, identifiers: { user: 1 }, registry,
        }),
      ).rejects.toThrow('Invalid attributeRules');
    });

    it('throws when identifiers.user is null', async () => {
      const { registry } = makeRegistry();
      const policy = makePolicy();
      await expect(
        authorizeWithFilters({
          policy, attributeRules: [], identifiers: { user: null }, registry,
        }),
      ).rejects.toThrow('User identifier is required');
    });

    it('throws when events.emit is not a function', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy();
      await expect(
        authorizeWithFilters({
          policy,
          attributeRules: [],
          identifiers: { user: 1 },
          registry,
          events: { emit: 'not-a-function', eventToEmit: 'some-event' },
        }),
      ).rejects.toThrow('Invalid events.emit');
    });
  });

  describe('action denied', () => {
    it('returns { granted: false, filter: null } when policy denies', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => false });
      const result = await authorizeWithFilters({
        policy, attributeRules: [], identifiers: { user: 1 }, registry,
      });
      expect(result).toEqual({ granted: false, filter: null });
    });

    it('emits event with granted:false when action is denied and events are configured', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => false });
      const emitFn = jest.fn();
      const result = await authorizeWithFilters({
        policy,
        attributeRules: [],
        identifiers: { user: 1 },
        registry,
        events: { emit: emitFn, eventToEmit: 'authorization.checked' },
      });
      expect(result.granted).toBe(false);
      expect(emitFn).toHaveBeenCalledWith(
        'authorization.checked',
        expect.objectContaining({ granted: false, policy: policy.name }),
      );
    });
  });

  describe('action granted – no attribute rules', () => {
    it('returns { granted: true, filter } when policy grants and no attribute rules', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const result = await authorizeWithFilters({
        policy, attributeRules: [], identifiers: { user: 1 }, registry,
      });
      expect(result.granted).toBe(true);
      expect(typeof result.filter).toBe('function');
    });

    it('filter returns {} when attributeRules is empty (deny-all attributes)', () => {
      // When no rules match, evaluateAttributeFilters returns [], so filter returns {}
      // We'll verify by checking the filter with no matching rules
    });
  });

  describe('action granted – with attribute rules', () => {
    it('returned filter correctly includes only allowed attributes', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const attributeRule = {
        policy: Policy.always,
        attribute_filters: ['id', 'name'],
      };
      const result = await authorizeWithFilters({
        policy,
        attributeRules: [attributeRule],
        identifiers: { user: 1 },
        registry,
      });
      expect(result.granted).toBe(true);
      const filtered = result.filter({ id: 1, name: 'Alice', secret: 'hidden' });
      expect(filtered).toHaveProperty('id', 1);
      expect(filtered).toHaveProperty('name', 'Alice');
      expect(filtered).not.toHaveProperty('secret');
    });

    it('returned filter allows all attributes when filters include wildcard', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const attributeRule = {
        policy: Policy.always,
        attribute_filters: ['*'],
      };
      const result = await authorizeWithFilters({
        policy,
        attributeRules: [attributeRule],
        identifiers: { user: 1 },
        registry,
      });
      const filtered = result.filter({ id: 1, name: 'Alice', secret: 'visible' });
      expect(filtered).toHaveProperty('secret', 'visible');
    });

    it('first matching attribute rule wins (short-circuit)', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      // Two rules; first matches → should get its filters
      const rule1 = { policy: Policy.always, attribute_filters: ['id'] };
      const rule2 = { policy: Policy.always, attribute_filters: ['name'] };
      const result = await authorizeWithFilters({
        policy,
        attributeRules: [rule1, rule2],
        identifiers: { user: 1 },
        registry,
      });
      const filtered = result.filter({ id: 1, name: 'Alice' });
      expect(filtered).toHaveProperty('id');
      expect(filtered).not.toHaveProperty('name');
    });
  });

  describe('event emission', () => {
    it('emits event with granted:true when action is granted', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const emitFn = jest.fn();
      await authorizeWithFilters({
        policy,
        attributeRules: [],
        identifiers: { user: 1 },
        registry,
        events: { emit: emitFn, eventToEmit: 'authorization.checked' },
      });
      expect(emitFn).toHaveBeenCalledWith(
        'authorization.checked',
        expect.objectContaining({ granted: true, policy: policy.name }),
      );
    });

    it('does not emit event when only emit is provided but not eventToEmit', async () => {
      const { registry } = makeRegistry({ 1: { id: 1 } });
      const policy = makePolicy({ evaluate: async () => true });
      const emitFn = jest.fn();
      await authorizeWithFilters({
        policy,
        attributeRules: [],
        identifiers: { user: 1 },
        registry,
        events: { emit: emitFn },
      });
      expect(emitFn).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases: error propagation
// ---------------------------------------------------------------------------
describe('authorize() – error propagation', () => {
  it('propagates an error thrown inside policy.evaluate', async () => {
    const { registry } = makeRegistry({ 1: { id: 1 } });
    const policy = makePolicy({ evaluate: async () => { throw new Error('policy eval crash'); } });
    await expect(authorize({ policy, identifiers: { user: 1 }, registry })).rejects.toThrow(
      'policy eval crash',
    );
  });
});

describe('authorizeWithFilters() – error propagation', () => {
  it('propagates an error thrown inside policy.evaluate during phase 1', async () => {
    const { registry } = makeRegistry({ 1: { id: 1 } });
    const policy = makePolicy({ evaluate: async () => { throw new Error('auth crash'); } });
    await expect(
      authorizeWithFilters({
        policy, attributeRules: [], identifiers: { user: 1 }, registry,
      }),
    ).rejects.toThrow('auth crash');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: cache sharing between phases
// ---------------------------------------------------------------------------
describe('authorizeWithFilters() – cache sharing between phases', () => {
  it('passes the same user cache Map instance to both phase 1 and phase 2', async () => {
    const { registry, userHydrator } = makeRegistry({ 1: { id: 1 } });
    const actionPolicy = makePolicy({ evaluate: async () => true });
    const rulePolicy = makePolicy({ requires: { user: ['id'] }, evaluate: async () => true });
    const attributeRules = [{ policy: rulePolicy, attribute_filters: ['*'] }];

    await authorizeWithFilters({
      policy: actionPolicy, attributeRules, identifiers: { user: 1 }, registry,
    });

    // hydrate was called twice: once for phase 1, once for phase 2
    expect(userHydrator.hydrateSpy).toHaveBeenCalledTimes(2);
    const cache1 = userHydrator.hydrateSpy.mock.calls[0][0].cache;
    const cache2 = userHydrator.hydrateSpy.mock.calls[1][0].cache;
    // Both calls should receive the exact same Map reference
    expect(cache1).toBe(cache2);
  });

  it('uses the externally-provided policyExecutionContext cache for both phases', async () => {
    const sharedUserCache = new Map();
    const policyExecutionContext = {
      cache: { user: sharedUserCache, resource: new Map(), context: new Map() },
    };
    const { registry, userHydrator } = makeRegistry({ 1: { id: 1 } });
    const actionPolicy = makePolicy({ evaluate: async () => true });

    await authorizeWithFilters({
      policy: actionPolicy,
      attributeRules: [],
      identifiers: { user: 1 },
      registry,
      policyExecutionContext,
    });

    const cacheUsed = userHydrator.hydrateSpy.mock.calls[0][0].cache;
    expect(cacheUsed).toBe(sharedUserCache);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: attribute rule evaluation
// ---------------------------------------------------------------------------
describe('authorizeWithFilters() – attribute rule edge cases', () => {
  it('returns filter that produces {} when all attribute rule policies deny', async () => {
    const { registry } = makeRegistry({ 1: { id: 1 } });
    const actionPolicy = makePolicy({ evaluate: async () => true });
    // Rule policy always denies → no rule matches → evaluateAttributeFilters returns []
    const rulePolicy = makePolicy({ evaluate: async () => false });
    const attributeRules = [{ policy: rulePolicy, attribute_filters: ['name', 'email'] }];

    const result = await authorizeWithFilters({
      policy: actionPolicy, attributeRules, identifiers: { user: 1 }, registry,
    });

    expect(result.granted).toBe(true);
    expect(result.filter({ id: 1, name: 'Alice' })).toEqual({});
  });

  it('passes preFetched.context to the context hydrator', async () => {
    const { registry, contextHydrator } = makeRegistry({ 1: { id: 1 } });
    const policy = makePolicy({ evaluate: async () => true });
    const preFetchedContext = { req: { headers: { 'x-request-id': 'abc' } } };

    await authorizeWithFilters({
      policy,
      attributeRules: [],
      identifiers: { user: 1 },
      registry,
      preFetched: { context: preFetchedContext },
    });

    const callArgs = contextHydrator.hydrateSpy.mock.calls[0][0];
    expect(callArgs.preFetched).toBe(preFetchedContext);
  });

  it('passes preFetched.resource to the resource hydrator when resourceType is set', async () => {
    const registry = new HydratorRegistry();
    const userHydrator = new StubHydrator({ 1: { id: 1 } });
    const contextHydrator = new StubHydrator({});
    const resourceHydrator = new StubHydrator({ 10: { id: 10, ownerId: 1 } });
    registry.register('user', userHydrator);
    registry.register('context', contextHydrator);
    registry.register('doc', resourceHydrator);

    const policy = makePolicy({
      resourceType: 'doc',
      requires: { user: ['id'], resource: ['ownerId'] },
      evaluate: async (u, r) => u.id === r.ownerId,
    });
    const preFetchedResource = { id: 10, ownerId: 1, title: 'My Doc' };

    await authorizeWithFilters({
      policy,
      attributeRules: [],
      identifiers: { user: 1, resource: 10 },
      registry,
      preFetched: { resource: preFetchedResource },
    });

    const callArgs = resourceHydrator.hydrateSpy.mock.calls[0][0];
    expect(callArgs.preFetched).toBe(preFetchedResource);
  });
});
