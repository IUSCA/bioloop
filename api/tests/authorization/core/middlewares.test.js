// Make asyncHandler a simple pass-through so the inner async function is invoked directly
// when the returned middleware is called in tests.
jest.mock('@/middleware/asyncHandler', () => (fn) => fn);

// Mock authorizeWithFilters to control authorization decisions in each test.
jest.mock('@/authorization/core/authorize', () => ({
  authorizeWithFilters: jest.fn(),
}));

const { authorizeWithFilters } = require('@/authorization/core/authorize');
const {
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
} = require('@/authorization/core/middlewares');
const Policy = require('@/authorization/core/policies/Policy');
const PolicyContainer = require('@/authorization/core/policies/PolicyContainer');
const PolicyRegistry = require('@/authorization/core/policies/PolicyRegistry');
const { HydratorRegistry } = require('@/authorization/core/hydrators/HydratorRegistry');
const { Hydrator } = require('@/authorization/core/hydrators/BaseHydrator');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds a simple mock Express req / res / next triple. */
function makeReqResNext(overrides = {}) {
  const req = {
    user: { id: 42, role: 'user' },
    params: { id: '99' },
    policyContext: null,
    ...overrides,
  };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
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

/**
 * A real policy registry holding one `post` container with `view` and `create` bound to the
 * given policy. The pipeline checks its registries when it is built, so a mock will not do.
 */
function makePolicyRegistry(policy) {
  const policyContainer = new PolicyContainer({ resourceType: 'post' })
    .actions({ view: policy, create: policy })
    .attributes({ '*': [{ policy: Policy.always, attribute_filters: ['*'] }] })
    .freeze();
  const registry = new PolicyRegistry();
  registry.register(policyContainer);
  return { registry, policyContainer };
}

/** Hydrators are never called, because authorizeWithFilters is mocked. */
class StubHydrator extends Hydrator {
  // eslint-disable-next-line class-methods-use-this
  async hydrate() { return {}; }
}
const stubHydrationRegistry = new HydratorRegistry();
stubHydrationRegistry.register('user', new StubHydrator());
stubHydrationRegistry.register('context', new StubHydrator());

// ---------------------------------------------------------------------------
// initializePolicyContext
// ---------------------------------------------------------------------------
describe('initializePolicyContext()', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next()', () => {
    const { req, res, next } = makeReqResNext({ policyContext: null });
    initializePolicyContext(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(/* no args */);
  });

  it('initializes req.policyContext when it is absent', () => {
    const { req, res, next } = makeReqResNext({ policyContext: null });
    initializePolicyContext(req, res, next);
    expect(req.policyContext).toBeDefined();
  });

  it('sets policyContext.cache with user, resource, context Map instances', () => {
    const { req, res, next } = makeReqResNext({ policyContext: null });
    initializePolicyContext(req, res, next);
    expect(req.policyContext.cache.user).toBeInstanceOf(Map);
    expect(req.policyContext.cache.resource).toBeInstanceOf(Map);
    expect(req.policyContext.cache.context).toBeInstanceOf(Map);
  });

  it('does not overwrite an existing policyContext', () => {
    const existingContext = { cache: { user: new Map([['x', 1]]) } };
    const { req, res, next } = makeReqResNext({ policyContext: existingContext });
    initializePolicyContext(req, res, next);
    expect(req.policyContext).toBe(existingContext);
    expect(req.policyContext.cache.user.get('x')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// createAuthorizationMiddlewareFunction - setup / fail-fast
// ---------------------------------------------------------------------------
describe('createAuthorizationMiddlewareFunction() - setup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws when the pipeline is built from something other than registries', () => {
    expect(() => createAuthorizationMiddlewareFunction({ get: () => null }, stubHydrationRegistry))
      .toThrow('pipeline: policyRegistry must be a PolicyRegistry');
  });

  it('throws at setup time when the resource type is not registered', () => {
    const { registry } = makePolicyRegistry(makePolicy());
    expect(() => createAuthorizationMiddlewareFunction(registry, stubHydrationRegistry)('comment', 'view'))
      .toThrow('No policies registered for resource type: comment');
  });

  it('throws at setup time when the action is not registered', () => {
    const { registry } = makePolicyRegistry(makePolicy());
    expect(() => createAuthorizationMiddlewareFunction(registry, stubHydrationRegistry)('post', 'delete'))
      .toThrow("Action 'delete' not found");
  });

  it('returns a function when setup succeeds', () => {
    const policy = makePolicy();
    const { registry } = makePolicyRegistry(policy);
    const authorize = createAuthorizationMiddlewareFunction(registry, stubHydrationRegistry);
    const middleware = authorize('post', 'view');
    expect(typeof middleware).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// createAuthorizationMiddlewareFunction - middleware behavior
// ---------------------------------------------------------------------------
describe('createAuthorizationMiddlewareFunction() - middleware', () => {
  let policy;
  let policyContainer;
  let policyRegistry;
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    policy = makePolicy();
    const built = makePolicyRegistry(policy);
    policyContainer = built.policyContainer;
    policyRegistry = built.registry;
    const authorize = createAuthorizationMiddlewareFunction(policyRegistry, stubHydrationRegistry, {});
    middleware = authorize('post', 'view');
  });

  it('calls next(createError(403)) when authorizeWithFilters returns granted:false', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: false, filter: null });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
  });

  it('sets req.permission and calls next() without args when granted', async () => {
    const filterFn = jest.fn((obj) => obj);
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: filterFn });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    expect(req.permission).toEqual({ granted: true, filter: filterFn });
    expect(next).toHaveBeenCalledWith(/* no args */);
  });

  it('extracts the caller subject_id from req.user by default', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext({ user: { id: 77, subject_id: 'subject-77' } });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.identifiers.user).toBe('subject-77');
  });

  it('extracts resourceId from req.params.id by default', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext({ params: { id: '55' } });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.identifiers.resource).toBe('55');
  });

  it('uses custom requesterFn to extract userId', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const authorize = createAuthorizationMiddlewareFunction(policyRegistry, stubHydrationRegistry, {});
    const customMiddleware = authorize('post', 'view', {
      requesterFn: (r) => ({ subject_id: r.user.adminSubjectId }),
    });
    const { req, res, next } = makeReqResNext({ user: { id: 1, adminSubjectId: 'subject-99' } });
    await customMiddleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.identifiers.user).toBe('subject-99');
  });

  it('uses custom resourceIdFn to extract resourceId', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const authorize = createAuthorizationMiddlewareFunction(policyRegistry, stubHydrationRegistry, {});
    const customMiddleware = authorize('post', 'view', { resourceIdFn: (r) => r.params.postId });
    const { req, res, next } = makeReqResNext({ params: { postId: '123' } });
    await customMiddleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.identifiers.resource).toBe('123');
  });

  it('passes req.user as preFetched.user', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const user = { id: 42, role: 'admin' };
    const { req, res, next } = makeReqResNext({ user });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.preFetched.user).toBe(user);
  });

  it('passes { req } as preFetched.context', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.preFetched.context).toEqual({ req });
  });

  it('passes the result of preFetchedResourceFn as preFetched.resource', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const prefetchedResource = { id: 1, title: 'Draft post' };
    const authorize = createAuthorizationMiddlewareFunction(policyRegistry, stubHydrationRegistry, {});
    const customMiddleware = authorize('post', 'create', { preFetchedResourceFn: () => prefetchedResource });
    const { req, res, next } = makeReqResNext();
    await customMiddleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.preFetched.resource).toBe(prefetchedResource);
  });

  it('passes policyExecutionContext from req.policyContext', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const policyContext = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
    const { req, res, next } = makeReqResNext({ policyContext });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.policyExecutionContext).toBe(policyContext);
  });

  it('passes the correct policy and attributeRules to authorizeWithFilters', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.policy).toBe(policyContainer.getPolicy('view'));
    expect(callArgs.attributeRules).toBe(policyContainer.getAttributeRules('view'));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('createAuthorizationMiddlewareFunction() - edge cases', () => {
  let policyRegistry;
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    const policy = makePolicy();
    policyRegistry = makePolicyRegistry(policy).registry;
    const authorize = createAuthorizationMiddlewareFunction(policyRegistry, stubHydrationRegistry, {});
    middleware = authorize('post', 'view');
  });

  it(
    'propagates a rejection from authorizeWithFilters as an unhandled async'
    + ' error (raw throw through mocked asyncHandler)',
    async () => {
      authorizeWithFilters.mockRejectedValue(new Error('Hydration failed'));
      const { req, res, next } = makeReqResNext();
      await expect(middleware(req, res, next)).rejects.toThrow('Hydration failed');
    },
  );

  it('passes undefined as preFetched.resource when no preFetchedResourceFn is provided', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.preFetched.resource).toBeUndefined();
  });

  it('creates a fresh hydration cache when req.policyContext is null', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext({ policyContext: null });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.policyExecutionContext.cache.user).toBeInstanceOf(Map);
    expect(callArgs.policyExecutionContext.cache.resource).toBeInstanceOf(Map);
    expect(callArgs.policyExecutionContext.cache.context).toBeInstanceOf(Map);
  });

  it('passes undefined as userId when req.user is undefined', async () => {
    authorizeWithFilters.mockResolvedValue({ granted: true, filter: null });
    const { req, res, next } = makeReqResNext({ user: undefined });
    await middleware(req, res, next);
    const callArgs = authorizeWithFilters.mock.calls[0][0];
    expect(callArgs.identifiers.user).toBeUndefined();
  });

  it('does not interfere with a previously set req.permission when access is granted again', async () => {
    const firstFilter = jest.fn();
    const secondFilter = jest.fn();
    authorizeWithFilters.mockResolvedValueOnce({ granted: true, filter: firstFilter });
    const { req, res, next } = makeReqResNext();
    await middleware(req, res, next);
    expect(req.permission.filter).toBe(firstFilter);

    // Simulate a second check on the same req (e.g., nested middleware)
    authorizeWithFilters.mockResolvedValueOnce({ granted: true, filter: secondFilter });
    await middleware(req, res, next);
    expect(req.permission.filter).toBe(secondFilter);
  });
});

describe('initializePolicyContext() - idempotency edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves cache entries populated between two consecutive initializePolicyContext calls', () => {
    const { req, res } = makeReqResNext({ policyContext: null });
    initializePolicyContext(req, res, jest.fn());
    req.policyContext.cache.user.set('userId:42', { id: 42 });

    const next2 = jest.fn();
    initializePolicyContext(req, res, next2); // second call - policyContext already set
    expect(req.policyContext.cache.user.get('userId:42')).toEqual({ id: 42 });
    expect(next2).toHaveBeenCalled();
  });

  it('calls next() on every invocation even when policyContext already exists', () => {
    const existingContext = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
    const { req, res } = makeReqResNext({ policyContext: existingContext });
    const next1 = jest.fn();
    const next2 = jest.fn();
    initializePolicyContext(req, res, next1);
    initializePolicyContext(req, res, next2);
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);
  });
});
