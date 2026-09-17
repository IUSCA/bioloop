# Core Authorization Framework

## ⚠️ Important: Do NOT Edit These Files in Derived Applications

This directory contains the **framework layer** of the authorization system. These files implement the foundational classes and utilities that power the ABAC (Attribute-Based Access Control) system.

**If you are working on a derived application (a clone of bioloop), you should NEVER edit files in this directory.** All customization should be done in the `custom/` directory.

Only edit these files if you are:
- Developing the base bioloop application
- Fixing bugs in the framework itself
- Adding new framework features that all derived apps will benefit from

## Framework Components

### Policy Framework

#### [policies/Policy.js](policies/Policy.js)
Base Policy class representing an authorization rule.

**Key Features:**
- Pure, synchronous evaluation of a leaf term; the startup check rejects an async term
- Explicit attribute requirements (`requires: { user, resource, context }`)
- A path kind in `meta`, which standing and the access model's tables read
- Policy combinators: `Policy.or()`, `Policy.and()`, `Policy.not()`
- Static policies: `Policy.always`, `Policy.never`
- Cloning and renaming support

**Example:**
```javascript
const isOwner = new Policy({
  name: 'isOwner',
  resourceType: 'project',
  meta: { pathKind: 'self' },
  requires: { user: ['id'], resource: ['owner_id'] },
  evaluate: (user, resource) => user.id === resource.owner_id,
});
```

#### [policies/PolicyContainer.js](policies/PolicyContainer.js)
Container for organizing resource-level policies.

**Key Features:**
- Fluent API for policy registration
- Action-to-policy mapping, with a restriction class per action: `mutating`, `reading`, or `readingData`
- Attribute filtering rules
- Immutability via `freeze()`
- Automatic policy naming

**Example:**
```javascript
const { mutating, reading } = PolicyContainer;

const container = new PolicyContainer({ resourceType: 'project' })
  .actions({ view: reading(isOwner), edit: mutating(isAdmin) })
  .attributes({ '*': [{ policy: isOwner, attribute_filters: ['*'] }] })
  .freeze();
```

#### [policies/PolicyRegistry.js](policies/PolicyRegistry.js)
Registry of policy containers by resource type.

**Key Features:**
- `register(container)` throws on a duplicate resource type
- `get(type)` throws when nothing is registered for the type
- `listTypes()` returns every registered type, which the completeness checks iterate

### Hydrator Framework

#### [hydrators/BaseHydrator.js](hydrators/BaseHydrator.js)
Abstract base class for all hydrators.

**Key Features:**
- Defines `hydrate()` interface
- Ensures subclasses implement hydration logic

#### [hydrators/PrismaHydrator.js](hydrators/PrismaHydrator.js)
Prisma-based hydrator with virtual attribute support.

**Key Features:**
- Automatic Prisma query generation
- Request-scoped caching
- Virtual attribute registration
- Incremental hydration (fetch only missing attributes)
- Column/relation classification via schema introspection

**Example:**
```javascript
const userHydrator = new PrismaHydrator({ 
  prismaClient: prisma, 
  modelName: 'user' 
});

userHydrator.registerVirtualAttribute('current_roles', async ({ id, hydrator }) => {
  // Custom attribute loading logic
});
```

#### [hydrators/HydratorRegistry.js](hydrators/HydratorRegistry.js)
Central registry for managing hydrators.

**Key Features:**
- Type-to-hydrator mapping
- Auto-hydrator factory (creates default hydrators on demand)
- Runtime registration

**Example:**
```javascript
const registry = new HydratorRegistry(createDefaultHydrator);
registry.register('user', userHydrator);
const hydrator = registry.get('user');
```

#### [hydrators/schemaMap.js](hydrators/schemaMap.js)
Prisma schema introspection utility.

**Key Features:**
- DMMF-based schema analysis
- Column vs relation classification
- Model field mapping

#### [hydrators/errors.js](hydrators/errors.js)
Custom error class for hydration failures.

#### [hydrationUtils.js](hydrationUtils.js)
Resolves the hydrators a policy needs and hydrates the user, resource, and context it declares,
using the request caches and any pre-fetched entities.

### Authorization Engine

#### [authorize.js](authorize.js)
Core authorization functions.

**Key Functions:**

##### `authorizeWithFilters({ policy, attributeRules, identifiers, registry, policyExecutionContext, preFetched })`
Two-phase authorization: action check + attribute filtering. Returns `{ granted, filter }`.

**Example:**
```javascript
const result = await authorizeWithFilters({
  policy: container.getPolicy('view'),
  attributeRules: container.getAttributeRules('view'),
  identifiers: { user: userId, resource: resourceId },
  registry: hydratorRegistry,
  policyExecutionContext: req.policyContext,
});

if (result.granted) {
  const filtered = result.filter(resourceObject);
}
```

#### [pipeline.js](pipeline.js)
The decision pipeline. The middleware and an application's `authorizeAction` both call it, so the
two cannot answer the same question differently.

**Key Functions:**

##### `createDecisionPipeline({ policyRegistry, hydratorRegistry, restrictionChecker, platformAdmin, expandPath, concealRefusalsWithoutStanding })`
Returns `decide(resourceType, action, options)`. It runs, in order, the injected restriction
checker, the injected platform-admin policy, and the action's policy and attribute rules. A refusal
carries `status`: 404 for a caller with no standing on a type in `concealRefusalsWithoutStanding`,
and 403 otherwise.

##### `filterRestrictedCapabilities({ capabilities, resourceType, resourceId, preFetchedResource, restrictionChecker })`
Turns off the capabilities a restriction blocks, keeping the map shape.

#### [capabilities.js](capabilities.js)
What a caller could do on a resource, and why.

**Key Functions:**
- `evaluateCapabilitySet({ policyContainer, identifiers, ... })`: a map of action name to boolean
- `deriveStanding({ policyContainer, identifiers, ..., expandPath })`: every path by which the
  caller reaches the resource, from the terms that hold on non-mutating actions. The application
  injects `expandPath` to turn a term into paths; the default reads the term's `meta`.
- `toCapabilitiesArray(capabilities)`: the granted action names

#### [requiresCheck.js](requiresCheck.js)
Startup checks over the registries.

**Key Functions:**
- `findUnhydratableRequirements(policyRegistry, hydratorRegistry)`: attributes no hydrator supplies
- `findAsyncTerms(policyRegistry)`: terms whose `evaluate` is async
- `assertRegistriesValid(policyRegistry, hydratorRegistry)`: throws when either finds a problem

#### [attributeFilters.js](attributeFilters.js)
Attribute filtering logic using the Notation library.

**Key Functions:**

##### `evaluateAttributeFilters(rules, identifiers, hydrators, caches)`
Evaluates every attribute rule and collects the filter lists of those that match.

##### `createFilterFunction(filterLists)`
Creates a filter function that projects an object through each filter list and returns the union.
An empty list of filter lists denies every field.

Supports:
- Inclusion: `['id', 'name']`
- Wildcards: `['*']`
- Exclusions: `['*', '!sensitive_field']`
- Nested paths: `['user.profile.name']`

### Middleware

#### [middlewares.js](middlewares.js)
Express middleware for authorization.

**Key Middleware:**

##### `initializePolicyContext(req, res, next)`
Initializes request-scoped caches for hydration.

**Usage:**
```javascript
app.use(initializePolicyContext);
```

##### `createAuthorizationMiddlewareFunction(policyRegistry, hydratorRegistry, events, restrictionChecker, platformAdmin, expandPath, options)`
Returns `authorize(resourceType, action, options)`, a middleware factory that decides through
`createDecisionPipeline` and sets `req.permission`. It throws at setup when the action is not
registered.

## Architecture Patterns

### 1. Dependency Inversion
Core framework depends on abstractions (`Policy`, `Hydrator`), not concrete implementations. Applications inject concrete policies and hydrators via registries.

### 2. Strategy Pattern
Policies are strategies for authorization decisions. Hydrators are strategies for data loading.

### 3. Registry Pattern
Centralized lookup for policies and hydrators, enabling plugin-like extensibility.

### 4. Template Method
`PrismaHydrator` provides template (`_preparePrismaQueryPayload`, `_fetchPrismaRecord`) that subclasses can override.

### 5. Builder/Fluent API
`PolicyContainer` uses method chaining for declarative policy configuration.

### 6. Cache-Aside
Request-scoped caching: check cache, fetch from DB if miss, populate cache.

## Testing Considerations

### Unit Testing Policies
```javascript
const policy = new Policy({ 
  name: 'test', 
  resourceType: null,
  requires: { user: ['id'] },
  evaluate: async (user) => user.id === 123,
});

const result = await policy.evaluate({ id: 123 }, {}, {});
assert(result === true);
```

### Unit Testing Hydrators
```javascript
const hydrator = new PrismaHydrator({ 
  prismaClient: mockPrisma, 
  modelName: 'user' 
});

const result = await hydrator.hydrate({
  id: 1,
  attributes: ['name'],
  cache: new Map(),
});

assert(result.name === 'John');
```

### Mocking in Integration Tests
Mock the `hydratorRegistry` to avoid database calls:

```javascript
const mockRegistry = {
  get: (type) => ({
    hydrate: async ({ attributes }) => {
      const mockData = { id: 1, name: 'Test' };
      return Object.fromEntries(
        attributes.map(attr => [attr, mockData[attr]])
      );
    },
  }),
  has: () => true,
};
```

## Performance Considerations

### Request-Scoped Caching
All hydrators within a single request share caches:
```javascript
req.policyContext = {
  cache: {
    user: new Map(),    // Cache user hydrations
    resource: new Map(), // Cache resource hydrations
    context: new Map(),  // Cache context hydrations
  },
};
```

### Incremental Hydration
Hydrators only fetch attributes not already in cache:
1. First policy evaluation: fetches required attributes
2. Second policy evaluation: reuses cached attributes, fetches only new ones

### Short-Circuit Evaluation
- `Policy.or()`: Returns `true` on first matching policy
- `Policy.and()`: Returns `false` on first failing policy
- Attribute rules: evaluated in full; the response is the union of every matching rule's projection

## Extending the Framework

⚠️ **Only do this in the base bioloop repo, not in derived apps!**

### Adding New Framework Features

1. Add feature to appropriate file (e.g., new policy combinator → `Policy.js`)
2. Export from `core/index.js`
3. Document in this README
4. Add tests
5. Update main README.md if user-facing

### Example: Adding a New Policy Combinator

```javascript
// In Policy.js
function xor(policies, name = null) {
  const resourceType = validateMergeAndResourceType(...policies);
  
  return new Policy({
    name: name || `xor(${policies.map((p) => p.name).join(',')})`,
    resourceType,
    requires: mergeRequires(...policies),
    evaluate: async (user, resource, ctx) => {
      let trueCount = 0;
      for (const p of policies) {
        if (await p.evaluate(user, resource, ctx)) {
          trueCount++;
        }
      }
      return trueCount === 1;
    },
  });
}

Policy.xor = xor;
```

## Troubleshooting

### "No policies registered for resource type: X"
- Register the policy container in `src/authorization/index.js`

### "Policies declare attributes no hydrator supplies" at startup
- A policy's `requires` names an attribute no column, relation, or virtual attribute provides
- Add a virtual attribute to the type's hydrator, or fix the name

### "Policies read the database inside evaluate" at startup
- A leaf term's `evaluate` is async; move its read into a hydrator virtual attribute

### "No hydrator registered for type: X"
- Check that the hydrator is registered in `index.js`
- Verify the resource type name matches
- Ensure auto-hydrator factory is configured if using on-demand hydrators

### "Missing required attributes for evaluation"
- Check policy's `requires` declaration
- Verify hydrator can fetch those attributes
- Check for typos in attribute names

### "Model X not found in Prisma schema"
- Verify Prisma schema includes the model
- Regenerate Prisma client: `npx prisma generate`
- Check model name casing (Prisma is case-sensitive)

## Version History

- **v1.0.0**: Initial three-layer architecture with ABAC implementation
