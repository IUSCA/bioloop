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
- Pure function evaluation
- Explicit attribute requirements (`requires: { user, resource, context }`)
- Policy combinators: `Policy.or()`, `Policy.and()`, `Policy.not()`
- Static policies: `Policy.always`, `Policy.never`
- Cloning and renaming support

**Example:**
```javascript
const isOwner = new Policy({
  name: 'isOwner',
  resourceType: 'project',
  requires: { user: ['id'], resource: ['owner_id'] },
  evaluate: async (user, resource) => user.id === resource.owner_id,
});
```

#### [policies/PolicyContainer.js](policies/PolicyContainer.js)
Container for organizing resource-level policies.

**Key Features:**
- Fluent API for policy registration
- Action-to-policy mapping
- Attribute filtering rules
- Immutability via `freeze()`
- Automatic policy naming

**Example:**
```javascript
const container = new PolicyContainer({ resourceType: 'project' })
  .actions({ view: isOwner, edit: isAdmin })
  .attributes({ '*': [{ policy: isOwner, attribute_filters: ['*'] }] })
  .freeze();
```

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

userHydrator.registerVirtualAttribute('roles', async ({ id, hydrator }) => {
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

### Authorization Engine

#### [authorize.js](authorize.js)
Core authorization functions.

**Key Functions:**

##### `authorize(policy, identifiers, registry, policyExecutionContext)`
Evaluates a policy and returns a boolean decision.

**Example:**
```javascript
const allowed = await authorize(
  somePolicy,
  { user: userId, resource: resourceId, context: contextId },
  hydratorRegistry,
  req.policyContext
);
```

##### `authorizeWithFilters(actionPolicy, attributeRules, identifiers, registry, policyExecutionContext)`
Two-phase authorization: action check + attribute filtering.

**Example:**
```javascript
const result = await authorizeWithFilters(
  container.getPolicy('view'),
  container.getAttributeRules('view'),
  { user: userId, resource: resourceId },
  hydratorRegistry,
  req.policyContext
);

if (result.granted) {
  const filtered = result.filter(resourceObject);
}
```

#### [attributeFilters.js](attributeFilters.js)
Attribute filtering logic using the Notation library.

**Key Functions:**

##### `evaluateAttributeFilters(rules, identifiers, hydrators, caches)`
Evaluates attribute rules with short-circuit logic.

##### `createFilterFunction(attributeFilters)`
Creates a filter function for object attribute filtering.

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
- Attribute rules: Returns first matching rule's filters

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
