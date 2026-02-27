const Policy = require('@/authorization/core/policies/Policy');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
// Constructor validation
// ---------------------------------------------------------------------------
describe('Policy constructor', () => {
  describe('name validation', () => {
    it('throws when name is missing', () => {
      expect(() => makePolicy({ name: undefined })).toThrow('Policy name must be a non-empty string');
    });
    it('throws when name is an empty string', () => {
      expect(() => makePolicy({ name: '' })).toThrow('Policy name must be a non-empty string');
    });
    it('throws when name is not a string', () => {
      expect(() => makePolicy({ name: 123 })).toThrow('Policy name must be a non-empty string');
    });
    it('accepts a valid non-empty string name', () => {
      const p = makePolicy({ name: 'validName' });
      expect(p.name).toBe('validName');
    });
  });

  describe('resourceType validation', () => {
    it('accepts null resourceType', () => {
      const p = makePolicy({ resourceType: null });
      expect(p.resourceType).toBeNull();
    });
    it('accepts a non-empty string resourceType', () => {
      const p = makePolicy({ resourceType: 'post' });
      expect(p.resourceType).toBe('post');
    });
    it('throws when resourceType is an empty string', () => {
      expect(() => makePolicy({ resourceType: '' })).toThrow(
        'Policy resourceType must be a non-empty string or null',
      );
    });
    it('throws when resourceType is a non-null non-string value', () => {
      expect(() => makePolicy({ resourceType: 42 })).toThrow(
        'Policy resourceType must be a non-empty string or null',
      );
    });
  });

  describe('requires validation', () => {
    it('throws when requires is not an object', () => {
      expect(() => makePolicy({ requires: 'user' })).toThrow('Policy requires must be an object');
    });
    it('throws when requires is null', () => {
      expect(() => makePolicy({ requires: null })).toThrow('Policy requires must be an object');
    });
    it('throws when requires has an invalid key', () => {
      expect(() => makePolicy({ requires: { admin: ['id'] } })).toThrow('Invalid key in policy requires: admin');
    });
    it('throws when a requires value is not an array', () => {
      expect(() => makePolicy({ requires: { user: 'id' } })).toThrow('Policy requires.user must be an array');
    });
    it('throws when a requires array contains a non-string', () => {
      expect(() => makePolicy({ requires: { user: [1] } })).toThrow(
        'Policy requires.user must be an array of strings',
      );
    });
    it('throws when requires has none of user / resource / context', () => {
      expect(() => makePolicy({ requires: {} })).toThrow(
        'Policy requires must have at least one of user, resource, or context',
      );
    });
    it('defaults missing requires keys to empty arrays', () => {
      const p = makePolicy({ requires: { user: ['id'] } });
      expect(p.requires.resource).toEqual([]);
      expect(p.requires.context).toEqual([]);
    });
  });

  describe('evaluate validation', () => {
    it('throws when evaluate is not a function', () => {
      expect(() => makePolicy({ evaluate: 'yes' })).toThrow('Policy evaluate must be a function');
    });
    it('throws when evaluate is missing', () => {
      expect(() => makePolicy({ evaluate: undefined })).toThrow('Policy evaluate must be a function');
    });
  });
});

// ---------------------------------------------------------------------------
// evaluate()
// ---------------------------------------------------------------------------
describe('Policy.evaluate()', () => {
  it('returns true when the inner evaluate resolves to true', async () => {
    const p = makePolicy({ evaluate: async () => true });
    await expect(p.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });

  it('returns false when the inner evaluate resolves to false', async () => {
    const p = makePolicy({ evaluate: async () => false });
    await expect(p.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });

  it('throws when a required user attribute is missing', async () => {
    const p = makePolicy({ requires: { user: ['id', 'role'] }, evaluate: async () => true });
    await expect(p.evaluate({ id: 1 }, {}, {})).rejects.toThrow(
      'Missing required user attributes for evaluation: role',
    );
  });

  it('throws when a required resource attribute is missing', async () => {
    const p = makePolicy({
      requires: { user: ['id'], resource: ['ownerId'] },
      evaluate: async () => true,
    });
    await expect(p.evaluate({ id: 1 }, {}, {})).rejects.toThrow(
      'Missing required resource attributes for evaluation: ownerId',
    );
  });

  it('throws when a required context attribute is missing', async () => {
    const p = makePolicy({
      requires: { user: ['id'], context: ['req'] },
      evaluate: async () => true,
    });
    await expect(p.evaluate({ id: 1 }, {}, {})).rejects.toThrow(
      'Missing required context attributes for evaluation: req',
    );
  });

  it('uses safe empty objects when user / resource / context are null', async () => {
    // no requires → nothing to check, evaluates with safe fallbacks
    const p = new Policy({
      name: 'safeFallback',
      resourceType: null,
      requires: { user: [] },
      evaluate: async (u, r, c) => u !== null && r !== null && c !== null,
    });
    await expect(p.evaluate(null, null, null)).resolves.toBe(true);
  });

  it('passes user, resource and context to the inner evaluate', async () => {
    const spy = jest.fn(async () => true);
    const p = makePolicy({ requires: { user: ['id'], resource: ['name'], context: ['req'] }, evaluate: spy });
    await p.evaluate({ id: 1 }, { name: 'doc' }, { req: {} });
    expect(spy).toHaveBeenCalledWith({ id: 1 }, { name: 'doc' }, { req: {} });
  });
});

// ---------------------------------------------------------------------------
// setName() / clone() / cloneWithName()
// ---------------------------------------------------------------------------
describe('Policy.setName()', () => {
  it('updates the policy name', () => {
    const p = makePolicy();
    p.setName('newName');
    expect(p.name).toBe('newName');
  });
  it('returns this for chaining', () => {
    const p = makePolicy();
    expect(p.setName('x')).toBe(p);
  });
  it('throws on empty string', () => {
    expect(() => makePolicy().setName('')).toThrow('Policy name must be a non-empty string');
  });
  it('throws on non-string', () => {
    expect(() => makePolicy().setName(5)).toThrow('Policy name must be a non-empty string');
  });
});

describe('Policy.clone()', () => {
  it('returns a new Policy instance with the same properties', () => {
    const p = makePolicy({ name: 'orig', requires: { user: ['id'] } });
    const cloned = p.clone();
    expect(cloned).toBeInstanceOf(Policy);
    expect(cloned).not.toBe(p);
    expect(cloned.name).toBe('orig');
  });
});

describe('Policy.cloneWithName()', () => {
  it('returns a new Policy with the given name', () => {
    const p = makePolicy({ name: 'orig' });
    const cloned = p.cloneWithName('renamed');
    expect(cloned.name).toBe('renamed');
    expect(cloned).not.toBe(p);
  });
  it('throws on invalid name', () => {
    expect(() => makePolicy().cloneWithName('')).toThrow('Policy name must be a non-empty string');
  });
});

// ---------------------------------------------------------------------------
// Policy.or()
// ---------------------------------------------------------------------------
describe('Policy.or()', () => {
  it('throws when called with no policies', () => {
    expect(() => Policy.or([])).toThrow('or() requires at least one policy');
  });
  it('throws when an argument is not a Policy instance', () => {
    expect(() => Policy.or([{}])).toThrow('All arguments to or() must be Policy instances');
  });
  it('throws when policies have different non-null resourceTypes', () => {
    const p1 = makePolicy({ resourceType: 'post' });
    const p2 = makePolicy({ resourceType: 'comment' });
    expect(() => Policy.or([p1, p2])).toThrow('Can only combine policies of the same resource type');
  });
  it('returns true if the first policy passes (short-circuits)', async () => {
    const evaluateB = jest.fn(async () => true);
    const a = makePolicy({ evaluate: async () => true });
    const b = makePolicy({ evaluate: evaluateB });
    const combined = Policy.or([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
    expect(evaluateB).not.toHaveBeenCalled();
  });
  it('returns true if any policy passes', async () => {
    const a = makePolicy({ evaluate: async () => false });
    const b = makePolicy({ evaluate: async () => true });
    const combined = Policy.or([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });
  it('returns false if all policies fail', async () => {
    const a = makePolicy({ evaluate: async () => false });
    const b = makePolicy({ evaluate: async () => false });
    const combined = Policy.or([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });
  it('merges requires from all policies', () => {
    const a = makePolicy({ requires: { user: ['id'] } });
    const b = makePolicy({ requires: { user: ['role'], resource: ['ownerId'] } });
    const combined = Policy.or([a, b]);
    expect(combined.requires.user).toEqual(expect.arrayContaining(['id', 'role']));
    expect(combined.requires.resource).toEqual(['ownerId']);
  });
  it('uses a null resourceType when all are null', () => {
    const a = makePolicy({ resourceType: null });
    const b = makePolicy({ resourceType: null });
    const combined = Policy.or([a, b]);
    expect(combined.resourceType).toBeNull();
  });
  it('accepts a custom name', () => {
    const p = makePolicy();
    const combined = Policy.or([p], 'myOrPolicy');
    expect(combined.name).toBe('myOrPolicy');
  });
});

// ---------------------------------------------------------------------------
// Policy.and()
// ---------------------------------------------------------------------------
describe('Policy.and()', () => {
  it('returns false if the first policy fails (short-circuits)', async () => {
    const evaluateB = jest.fn(async () => true);
    const a = makePolicy({ evaluate: async () => false });
    const b = makePolicy({ evaluate: evaluateB });
    const combined = Policy.and([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
    expect(evaluateB).not.toHaveBeenCalled();
  });
  it('returns true only when all policies pass', async () => {
    const a = makePolicy({ evaluate: async () => true });
    const b = makePolicy({ evaluate: async () => true });
    const combined = Policy.and([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });
  it('returns false when any policy fails', async () => {
    const a = makePolicy({ evaluate: async () => true });
    const b = makePolicy({ evaluate: async () => false });
    const combined = Policy.and([a, b]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });
  it('accepts a custom name', () => {
    const p = makePolicy();
    const combined = Policy.and([p], 'myAndPolicy');
    expect(combined.name).toBe('myAndPolicy');
  });
});

// ---------------------------------------------------------------------------
// Policy.not()
// ---------------------------------------------------------------------------
describe('Policy.not()', () => {
  it('inverts a true result', async () => {
    const p = makePolicy({ evaluate: async () => true });
    const inverted = Policy.not(p);
    await expect(inverted.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });
  it('inverts a false result', async () => {
    const p = makePolicy({ evaluate: async () => false });
    const inverted = Policy.not(p);
    await expect(inverted.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });
  it('throws when argument is not a Policy instance', () => {
    expect(() => Policy.not(null)).toThrow('not() requires a Policy instance');
    expect(() => Policy.not({})).toThrow('not() requires a Policy instance');
  });
  it('preserves resourceType', () => {
    const p = makePolicy({ resourceType: 'post' });
    const inverted = Policy.not(p);
    expect(inverted.resourceType).toBe('post');
  });
  it('accepts a custom name', () => {
    const p = makePolicy();
    const inverted = Policy.not(p, 'isNotOwner');
    expect(inverted.name).toBe('isNotOwner');
  });
});

// ---------------------------------------------------------------------------
// Policy.always / Policy.never
// ---------------------------------------------------------------------------
describe('Policy.always', () => {
  it('evaluates to true', async () => {
    await expect(Policy.always.evaluate({}, {}, {})).resolves.toBe(true);
  });
  it('is an instance of Policy', () => {
    expect(Policy.always).toBeInstanceOf(Policy);
  });
});

describe('Policy.never', () => {
  it('evaluates to false', async () => {
    await expect(Policy.never.evaluate({}, {}, {})).resolves.toBe(false);
  });
  it('is an instance of Policy', () => {
    expect(Policy.never).toBeInstanceOf(Policy);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: composition
// ---------------------------------------------------------------------------
describe('Policy composition – edge cases', () => {
  it('or() with a single policy works transparently', async () => {
    const p = makePolicy({ evaluate: async () => true });
    const combined = Policy.or([p]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });

  it('and() with a single policy works transparently', async () => {
    const p = makePolicy({ evaluate: async () => false });
    const combined = Policy.and([p]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });

  it('or/and adopt the non-null resourceType when one policy has null and another has a type', () => {
    const nullPolicy = makePolicy({ resourceType: null });
    const typedPolicy = makePolicy({ resourceType: 'post' });
    const combined = Policy.or([nullPolicy, typedPolicy]);
    expect(combined.resourceType).toBe('post');
  });

  it('or() auto-generates a default name that contains each policy name', () => {
    const a = makePolicy({ name: 'policyA' });
    const b = makePolicy({ name: 'policyB' });
    const combined = Policy.or([a, b]);
    expect(combined.name).toContain('policyA');
    expect(combined.name).toContain('policyB');
  });

  it('and() auto-generates a default name that contains each policy name', () => {
    const a = makePolicy({ name: 'policyA' });
    const b = makePolicy({ name: 'policyB' });
    const combined = Policy.and([a, b]);
    expect(combined.name).toContain('policyA');
    expect(combined.name).toContain('policyB');
  });

  it('or() deduplicates overlapping requires attributes', () => {
    const a = makePolicy({ requires: { user: ['id', 'role'] } });
    const b = makePolicy({ requires: { user: ['id', 'email'] } });
    const combined = Policy.or([a, b]);
    // 'id' appears in both—should only appear once
    expect(combined.requires.user.filter((k) => k === 'id')).toHaveLength(1);
    expect(combined.requires.user).toEqual(expect.arrayContaining(['id', 'role', 'email']));
  });

  it('or(and(p1,p2), not(p3)) evaluates to true when and-branch is true', async () => {
    const p1 = makePolicy({ evaluate: async () => true });
    const p2 = makePolicy({ evaluate: async () => true });
    const p3 = makePolicy({ evaluate: async () => false }); // not(false) = true, but short-circuit happens
    // and([p1,p2]) = true → or short-circuits immediately → true
    const combined = Policy.or([Policy.and([p1, p2]), Policy.not(p3)]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(true);
  });

  it('or(and(p1,p2), not(p3)) evaluates to false when both branches are false', async () => {
    const pFalse1 = makePolicy({ evaluate: async () => false });
    const pFalse2 = makePolicy({ evaluate: async () => false });
    const pTrue = makePolicy({ evaluate: async () => true });
    // or(and(false,false), not(true)) → or(false, false) → false
    const combined = Policy.or([Policy.and([pFalse1, pFalse2]), Policy.not(pTrue)]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).resolves.toBe(false);
  });

  it('or(never, always) evaluates to true via the always branch', async () => {
    const combined = Policy.or([Policy.never, Policy.always]);
    await expect(combined.evaluate({}, {}, {})).resolves.toBe(true);
  });

  it('and(always, never) evaluates to false via the never branch', async () => {
    const combined = Policy.and([Policy.always, Policy.never]);
    await expect(combined.evaluate({}, {}, {})).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: error propagation
// ---------------------------------------------------------------------------
describe('Policy.evaluate() – error propagation', () => {
  it('propagates an error thrown by the inner evaluate function', async () => {
    const p = makePolicy({
      evaluate: async () => { throw new Error('unexpected DB failure'); },
    });
    await expect(p.evaluate({ id: 1 }, {}, {})).rejects.toThrow('unexpected DB failure');
  });

  it('or() propagates an error thrown by the first policy (before short-circuit)', async () => {
    const throwing = makePolicy({ evaluate: async () => { throw new Error('inner failure'); } });
    const second = makePolicy({ evaluate: async () => true });
    const combined = Policy.or([throwing, second]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).rejects.toThrow('inner failure');
  });

  it('and() propagates an error thrown by a policy after the first passes', async () => {
    const first = makePolicy({ evaluate: async () => true });
    const throwing = makePolicy({ evaluate: async () => { throw new Error('and failure'); } });
    const combined = Policy.and([first, throwing]);
    await expect(combined.evaluate({ id: 1 }, {}, {})).rejects.toThrow('and failure');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: clone immutability
// ---------------------------------------------------------------------------
describe('Policy clone immutability', () => {
  it('cloneWithName() does not mutate the original policy name', () => {
    const p = makePolicy({ name: 'original' });
    p.cloneWithName('cloned');
    expect(p.name).toBe('original');
  });

  it('mutating a clone via setName() does not affect the original', () => {
    const p = makePolicy({ name: 'original' });
    const cloned = p.clone();
    cloned.setName('changed');
    expect(p.name).toBe('original');
  });

  it('cloned policy shares the same _evaluate function reference', () => {
    const evalFn = async () => true;
    const p = makePolicy({ evaluate: evalFn });
    const cloned = p.clone();
    expect(cloned._evaluate).toBe(p._evaluate);
  });
});
