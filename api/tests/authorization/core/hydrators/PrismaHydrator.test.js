// Mock schemaMap at the module level (before any requires) so that Prisma.dmmf is never called.
// The mock resolves to the same absolute path that PrismaHydrator.js uses for './schemaMap'.
jest.mock('@/authorization/core/hydrators/schemaMap', () => ({
  modelFieldMap: new Map([
    [
      'User',
      new Map([
        ['id', false], // column (isRelation = false)
        ['name', false], // column
        ['email', false], // column
        ['posts', true], // relation (isRelation = true)
      ]),
    ],
  ]),
}));

const { PrismaHydrate } = require('@/authorization/core/hydrators/PrismaHydrator');
const { HydrationError } = require('@/authorization/core/hydrators/errors');
const { Hydrate } = require('@/authorization/core/hydrators/BaseHydrator');

// ---------------------------------------------------------------------------
// Helper: build a minimal mock PrismaClient for the 'User' model
// ---------------------------------------------------------------------------
function makePrismaClient(record = {
  id: 1, name: 'Alice', email: 'alice@example.com', posts: [],
}) {
  return {
    User: {
      findUniqueOrThrow: jest.fn(async () => ({ ...record })),
    },
  };
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('PrismaHydrate constructor', () => {
  it('creates an instance successfully for a known model', () => {
    const h = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User' });
    expect(h).toBeInstanceOf(PrismaHydrate);
    expect(h).toBeInstanceOf(Hydrate);
  });

  it('defaults idAttribute to "id"', () => {
    const h = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User' });
    expect(h.idAttribute).toBe('id');
  });

  it('accepts a custom idAttribute', () => {
    const h = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User', idAttribute: 'email' });
    expect(h.idAttribute).toBe('email');
  });

  it('throws when modelName is not in the schema map', () => {
    expect(() => new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'NonExistent' })).toThrow(
      'Model NonExistent not found in Prisma schema',
    );
  });
});

// ---------------------------------------------------------------------------
// registerVirtualAttribute()
// ---------------------------------------------------------------------------
describe('PrismaHydrate.registerVirtualAttribute()', () => {
  let hydrator;
  beforeEach(() => {
    hydrator = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User' });
  });

  it('registers a virtual loader and stores it', () => {
    const loader = jest.fn(async () => 'virtual-value');
    hydrator.registerVirtualAttribute('displayName', loader);
    expect(hydrator.virtualLoaders.has('displayName')).toBe(true);
  });

  it('throws when attrName is an empty string', () => {
    expect(() => hydrator.registerVirtualAttribute('', () => {})).toThrow(
      'Virtual attribute name must be a non-empty string',
    );
  });

  it('throws when attrName is not a string', () => {
    expect(() => hydrator.registerVirtualAttribute(null, () => {})).toThrow(
      'Virtual attribute name must be a non-empty string',
    );
  });

  it('throws when loaderFn is not a function', () => {
    expect(() => hydrator.registerVirtualAttribute('displayName', 'not-a-fn')).toThrow(
      'Virtual attribute loader must be a function',
    );
  });

  it('throws when the same virtual attribute is registered twice', () => {
    hydrator.registerVirtualAttribute('displayName', async () => 'v');
    expect(() => hydrator.registerVirtualAttribute('displayName', async () => 'v2')).toThrow(
      'Virtual attribute loader already registered: displayName',
    );
  });

  it('throws when attrName conflicts with an actual schema field', () => {
    expect(() => hydrator.registerVirtualAttribute('name', async () => 'virtual')).toThrow(
      'Cannot register virtual attribute loader: name is a column or relation',
    );
  });
});

// ---------------------------------------------------------------------------
// _classifyAttributes()
// ---------------------------------------------------------------------------
describe('PrismaHydrate._classifyAttributes()', () => {
  let hydrator;
  beforeEach(() => {
    hydrator = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User' });
    hydrator.registerVirtualAttribute('displayName', async () => 'v');
  });

  it('classifies known columns correctly', () => {
    const result = hydrator._classifyAttributes(['id', 'name', 'email']);
    expect(result.columns).toEqual(expect.arrayContaining(['id', 'name', 'email']));
    expect(result.relations).toHaveLength(0);
    expect(result.virtual).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it('classifies known relations correctly', () => {
    const result = hydrator._classifyAttributes(['posts']);
    expect(result.relations).toEqual(['posts']);
    expect(result.columns).toHaveLength(0);
  });

  it('classifies registered virtual attributes', () => {
    const result = hydrator._classifyAttributes(['displayName']);
    expect(result.virtual).toEqual(['displayName']);
  });

  it('classifies unknown attributes', () => {
    const result = hydrator._classifyAttributes(['unknownField']);
    expect(result.unknown).toEqual(['unknownField']);
  });
});

// ---------------------------------------------------------------------------
// hydrate() – input validation
// ---------------------------------------------------------------------------
describe('PrismaHydrate.hydrate() - input validation', () => {
  let hydrator;
  beforeEach(() => {
    hydrator = new PrismaHydrate({ prismaClient: makePrismaClient(), modelName: 'User' });
  });

  it('throws HydrationError when attributes is not an array', async () => {
    await expect(hydrator.hydrate({ id: 1, attributes: 'name', cache: new Map() })).rejects.toThrow(
      HydrationError,
    );
  });

  it('throws HydrationError when an attribute name is not a string', async () => {
    await expect(hydrator.hydrate({ id: 1, attributes: [123], cache: new Map() })).rejects.toThrow(
      HydrationError,
    );
  });

  it('throws HydrationError when cache is not a Map', async () => {
    await expect(hydrator.hydrate({ id: 1, attributes: ['name'], cache: {} })).rejects.toThrow(
      HydrationError,
    );
  });

  it('throws HydrationError for unknown attributes', async () => {
    await expect(
      hydrator.hydrate({ id: 1, attributes: ['unknownField'], cache: new Map() }),
    ).rejects.toThrow(HydrationError);
  });

  it('throws HydrationError when id is null but DB attributes are required', async () => {
    await expect(
      hydrator.hydrate({ id: null, attributes: ['name'], cache: new Map() }),
    ).rejects.toThrow(HydrationError);
  });
});

// ---------------------------------------------------------------------------
// hydrate() – fetching columns and relations
// ---------------------------------------------------------------------------
describe('PrismaHydrate.hydrate() - DB fetch', () => {
  let prismaClient;
  let hydrator;

  beforeEach(() => {
    prismaClient = makePrismaClient({
      id: 1, name: 'Alice', email: 'alice@example.com', posts: [],
    });
    hydrator = new PrismaHydrate({ prismaClient, modelName: 'User' });
  });

  it('fetches the requested columns from the database', async () => {
    const result = await hydrator.hydrate({ id: 1, attributes: ['name', 'email'], cache: new Map() });
    expect(result).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
    expect(prismaClient.User.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it('always includes the idAttribute in the select payload', async () => {
    await hydrator.hydrate({ id: 1, attributes: ['name'], cache: new Map() });
    const payload = prismaClient.User.findUniqueOrThrow.mock.calls[0][0];
    expect(payload.select).toHaveProperty('id', true);
  });

  it('uses the correct where clause with the id', async () => {
    await hydrator.hydrate({ id: 42, attributes: ['name'], cache: new Map() });
    const payload = prismaClient.User.findUniqueOrThrow.mock.calls[0][0];
    expect(payload.where).toEqual({ id: 42 });
  });

  it('includes relation in select when a relation attribute is requested', async () => {
    await hydrator.hydrate({ id: 1, attributes: ['posts'], cache: new Map() });
    const payload = prismaClient.User.findUniqueOrThrow.mock.calls[0][0];
    expect(payload.select).toHaveProperty('posts', true);
  });

  it('does not call the DB for attributes already in the cache', async () => {
    const cache = new Map();
    cache.set('1', { id: 1, name: 'Cached' });
    await hydrator.hydrate({ id: 1, attributes: ['name'], cache });
    expect(prismaClient.User.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('uses an empty attributes array without calling the DB when all attrs are cached', async () => {
    const cache = new Map();
    await hydrator.hydrate({ id: 1, attributes: [], cache });
    expect(prismaClient.User.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hydrate() – preFetched handling
// ---------------------------------------------------------------------------
describe('PrismaHydrate.hydrate() - preFetched', () => {
  let prismaClient;
  let hydrator;

  beforeEach(() => {
    prismaClient = makePrismaClient({ id: 1, name: 'DB-Alice' });
    hydrator = new PrismaHydrate({ prismaClient, modelName: 'User' });
  });

  it('uses preFetched values instead of fetching from the DB', async () => {
    const result = await hydrator.hydrate({
      id: 1,
      attributes: ['name'],
      cache: new Map(),
      preFetched: { name: 'PreFetched-Alice', id: 1 },
    });
    expect(result.name).toBe('PreFetched-Alice');
    expect(prismaClient.User.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not overwrite cached values with preFetched values', async () => {
    const cache = new Map();
    cache.set('1', { id: 1, name: 'CachedName' });
    await hydrator.hydrate({
      id: 1,
      attributes: ['name'],
      cache,
      preFetched: { name: 'PreFetchedName', id: 1 },
    });
    expect(cache.get('1').name).toBe('CachedName');
  });
});

// ---------------------------------------------------------------------------
// hydrate() – virtual attributes
// ---------------------------------------------------------------------------
describe('PrismaHydrate.hydrate() - virtual attributes', () => {
  let prismaClient;
  let hydrator;

  beforeEach(() => {
    prismaClient = makePrismaClient({ id: 1, name: 'Alice' });
    hydrator = new PrismaHydrate({ prismaClient, modelName: 'User' });
  });

  it('resolves a virtual attribute using its loader', async () => {
    hydrator.registerVirtualAttribute('displayName', async ({ recordCache }) => `${recordCache.name} (display)`);

    const result = await hydrator.hydrate({
      id: 1,
      attributes: ['name', 'displayName'],
      cache: new Map(),
    });
    expect(result.displayName).toBe('Alice (display)');
  });

  it('calls the virtual loader with { id, recordCache, hydrator }', async () => {
    const loader = jest.fn(async ({ id, recordCache, hydrator: h }) => `${id}:${recordCache.id}:${h === hydrator}`);
    hydrator.registerVirtualAttribute('computed', loader);

    await hydrator.hydrate({ id: 1, attributes: ['computed'], cache: new Map() });

    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, recordCache: expect.any(Object), hydrator }),
    );
  });

  it('sets idAttribute in cache even when only virtual attributes are requested', async () => {
    hydrator.registerVirtualAttribute('alwaysTrue', async () => true);
    const cache = new Map();
    await hydrator.hydrate({ id: 99, attributes: ['alwaysTrue'], cache });
    expect(cache.get('99').id).toBe(99);
  });

  it('does not re-run virtual loaders for already-cached virtual attributes', async () => {
    const loader = jest.fn(async () => 'computed-value');
    hydrator.registerVirtualAttribute('expensive', loader);

    const cache = new Map();
    // First call
    await hydrator.hydrate({ id: 1, attributes: ['expensive'], cache });
    // Second call (cache hit)
    await hydrator.hydrate({ id: 1, attributes: ['expensive'], cache });

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('PrismaHydrate – edge cases', () => {
  describe('falsy but valid id = 0', () => {
    it('treats id=0 as a valid non-null identifier (not treated like null)', async () => {
      const pc = makePrismaClient({ id: 0, name: 'Zero' });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      await h.hydrate({ id: 0, attributes: ['name'], cache: new Map() });
      expect(pc.User.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    });

    it('uses id=0 correctly in the Prisma where clause', async () => {
      const pc = makePrismaClient({ id: 0, name: 'Zero' });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      await h.hydrate({ id: 0, attributes: ['name'], cache: new Map() });
      const payload = pc.User.findUniqueOrThrow.mock.calls[0][0];
      expect(payload.where).toEqual({ id: 0 });
    });
  });

  describe('falsy attribute values in preFetched', () => {
    it('preserves an empty string preFetched value without re-fetching from DB', async () => {
      const pc = makePrismaClient({ id: 1, name: 'Alice' });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      const result = await h.hydrate({
        id: 1,
        attributes: ['name'],
        cache: new Map(),
        preFetched: { name: '', id: 1 }, // falsy string for 'name'
      });
      expect(result.name).toBe('');
      expect(pc.User.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('cache key: numeric id vs string id', () => {
    it(
      'numeric id 1 and string id "1" map to the same cache key, producing a cache hit on the second call',
      async () => {
        const pc = makePrismaClient({ id: 1, name: 'Alice' });
        const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
        const cache = new Map();

        await h.hydrate({ id: 1, attributes: ['name'], cache });
        expect(pc.User.findUniqueOrThrow).toHaveBeenCalledTimes(1);

        // String "1" produces the same cache key "1" → cache hit, no extra DB call
        await h.hydrate({ id: '1', attributes: ['name'], cache });
        expect(pc.User.findUniqueOrThrow).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('Prisma client errors', () => {
    it('propagates errors thrown by findUniqueOrThrow directly', async () => {
      const pc = makePrismaClient();
      pc.User.findUniqueOrThrow.mockRejectedValue(new Error('Record not found'));
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      await expect(
        h.hydrate({ id: 999, attributes: ['name'], cache: new Map() }),
      ).rejects.toThrow('Record not found');
    });
  });

  describe('custom idAttribute', () => {
    it('uses the custom idAttribute in the Prisma where clause', async () => {
      const pc = makePrismaClient({ email: 'a@b.com', name: 'Alice', id: undefined });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User', idAttribute: 'email' });
      await h.hydrate({ id: 'a@b.com', attributes: ['name'], cache: new Map() });
      const payload = pc.User.findUniqueOrThrow.mock.calls[0][0];
      expect(payload.where).toEqual({ email: 'a@b.com' });
    });

    it('always includes the custom idAttribute in the select clause', async () => {
      const pc = makePrismaClient({ email: 'a@b.com', name: 'Alice', id: undefined });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User', idAttribute: 'email' });
      await h.hydrate({ id: 'a@b.com', attributes: ['name'], cache: new Map() });
      const payload = pc.User.findUniqueOrThrow.mock.calls[0][0];
      expect(payload.select).toHaveProperty('email', true);
      // The default 'id' column should NOT be auto-included when idAttribute is overridden
      expect(payload.select).not.toHaveProperty('id');
    });
  });

  describe('virtual loader receives up-to-date recordCache', () => {
    it('virtual loader runs after DB fetch and can read DB-fetched columns from the same hydrate() call', async () => {
      const pc = makePrismaClient({ id: 1, name: 'Alice' });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      let capturedCache;
      h.registerVirtualAttribute('greeting', async ({ recordCache }) => {
        capturedCache = { ...recordCache };
        return `Hello, ${recordCache.name}`;
      });
      const result = await h.hydrate({ id: 1, attributes: ['name', 'greeting'], cache: new Map() });
      // Virtual loader was able to see 'name' from the DB fetch that happened in the same call
      expect(capturedCache).toHaveProperty('name', 'Alice');
      expect(result.greeting).toBe('Hello, Alice');
    });

    it('two virtual attributes requested together are both resolved', async () => {
      const pc = makePrismaClient({ id: 1 });
      const h = new PrismaHydrate({ prismaClient: pc, modelName: 'User' });
      h.registerVirtualAttribute('v1', async () => 'value1');
      h.registerVirtualAttribute('v2', async () => 'value2');
      const result = await h.hydrate({ id: 1, attributes: ['v1', 'v2'], cache: new Map() });
      expect(result.v1).toBe('value1');
      expect(result.v2).toBe('value2');
    });
  });
});
