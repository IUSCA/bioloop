# Authorization System

## Overview

This is an **Attribute-Based Access Control (ABAC)** implementation with a three-layer architecture designed to minimize merge conflicts when creating derived applications.

## Three-Layer Architecture

```
authorization/
├── core/              # FRAMEWORK LAYER - Never edit in derived apps
│   ├── policies/      # Policy and PolicyContainer classes
│   ├── hydrators/     # Hydrator base classes and registry
│   ├── authorize.js   # Core authorization engine
│   ├── attributeFilters.js
│   ├── middlewares.js
│   └── index.js       # Framework exports
│
├── builtin/           # BASE APPLICATION LAYER - Rarely edit in derived apps
│   ├── policies/      # Builtin resource policies (group, collection)
│   ├── hydrators/     # Builtin hydrators (user, context)
│   └── audit/         # Audit event types
│
├── custom/            # DERIVED APPLICATION LAYER - Only exists in derived apps
│   ├── policies/      # Your custom resource policies
│   ├── hydrators/     # Your custom hydrators
│   └── README.md      # Extension guide
│
├── index.js           # Main entry point (explicit imports & registration)
└── README.md          # This file
```

### Layer Responsibilities

| Layer | Contains | Edited in Base Repo? | Edited in Derived Apps? |
|-------|----------|----------------------|-------------------------|
| **core/** | Framework classes, authorization engine | ✅ Yes | ❌ Never |
| **builtin/** | Base app policies (group, collection) | ✅ Yes | ⚠️ Rarely |
| **custom/** | Derived app policies (project, experiment) | ❌ N/A | ✅ Always |

### Merge Conflict Strategy

When merging base repo updates into a derived app:

1. **core/ changes**: Auto-accept (you never edit these)
2. **builtin/ changes**: Auto-accept (you rarely edit these)
3. **index.js conflicts**: Simple to resolve:
   - Accept both changes
   - Your custom imports stay in Section 3
   - Your custom registrations stay in Sections 4 & 5

## Implementation Invariants

- **Policies as pure functions**: Stateless evaluation based only on provided attributes
- **Explicit attribute declarations**: Policies declare exactly what they need (`requires: { user: [...], resource: [...] }`)
- **Centralized loaders**: Hydrators manage all data fetching
- **Request-scoped caching**: Avoid redundant database queries within a request
- **Zero knowledge at call sites**: Routes just call `authorize()`, don't need to know policy internals
- **Separation of concerns**: Policy definition, data loading, and enforcement are separate

## Quick Start

### Using Authorization in Routes

```javascript
const { authorize, POLICY_REGISTRY, hydratorRegistry } = require('@/authorization');

router.get('/groups/:id', async (req, res) => {
  const allowed = await authorize(
    POLICY_REGISTRY.group.getPolicy('view_metadata'),
    {
      user: req.user.id,
      resource: req.params.id,
      context: req.id
    },
    hydratorRegistry,
    req.policyContext
  );

  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ... proceed with request
});
```

### Adding Authorization to a Derived App

See [custom/README.md](custom/README.md) for detailed instructions on:
- Creating custom policies
- Creating custom hydrators
- Registering them in index.js
- Testing your authorization

## Architecture Details

### Policies

Policies are instances of the `Policy` class that define authorization rules:

```javascript
const isGroupAdmin = new Policy({
  name: 'isGroupAdmin',
  resourceType: 'group',
  requires: {
    user: ['group_memberships'],
    resource: ['id'],
  },
  evaluate: (user, group) => user
    .group_memberships
    .some((m) => m.group_id === group.id && m.role === 'ADMIN'),
});
```

#### Policy Combinators

Combine policies using `Policy.or()`, `Policy.and()`, `Policy.not()`:

```javascript
const canEdit = Policy.or([isPlatformAdmin, isGroupAdmin]);
const canView = Policy.and([isAuthenticated, isGroupMember]);
const isNotBanned = Policy.not(isBanned);
```

### Policy Containers

`PolicyContainer` organizes policies for a resource type:

```javascript
const groupPolicies = new PolicyContainer({
  resourceType: 'group',
  version: '1.0.0',
});

groupPolicies
  .actions({
    create: isPlatformAdmin,
    view_metadata: Policy.or([isGroupAdmin, isGroupMember]),
    edit_metadata: isGroupAdmin,
  })
  .attributes({
    '*': [
      { policy: isGroupAdmin, attribute_filters: ['*'] },
      { policy: isGroupMember, attribute_filters: ['id', 'name'] },
    ],
  })
  .freeze();
```

### Hydrators

Hydrators fetch entity attributes needed by policies:

```javascript
const userHydrator = new PrismaHydrate({ 
  prismaClient: prisma, 
  modelName: 'user' 
});

// Register virtual attributes (computed/derived data)
userHydrator.registerVirtualAttribute('roles', async ({ id, hydrator }) => {
  const roles = await hydrator.prisma.user_role.findMany({
    where: { user_id: id },
    include: { roles: true },
  });
  return roles.map((r) => r.roles.name);
});
```

### Two-Phase Authorization

1. **Phase 1: Action Authorization**
   - Check if user can perform the action (e.g., "view_metadata")
   - Returns boolean

2. **Phase 2: Attribute Filtering** (optional)
   - Determine which attributes user can see
   - Returns filter function

```javascript
const result = await authorizeWithFilters(
  groupPolicies.getPolicy('view_metadata'),
  groupPolicies.getAttributeRules('view_metadata'),
  { user: req.user.id, resource: req.params.id },
  hydratorRegistry,
  req.policyContext
);

if (result.granted) {
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  res.json(result.filter(group)); // Returns only allowed attributes
}
```

## File Organization

### Core Framework Files

- **[core/policies/Policy.js](core/policies/Policy.js)**: Base Policy class with combinators
- **[core/policies/PolicyContainer.js](core/policies/PolicyContainer.js)**: Container for organizing resource policies
- **[core/hydrators/BaseHydrator.js](core/hydrators/BaseHydrator.js)**: Abstract Hydrate base class
- **[core/hydrators/PrismaHydrator.js](core/hydrators/PrismaHydrator.js)**: Prisma-based hydrator with virtual attributes
- **[core/hydrators/HydratorRegistry.js](core/hydrators/HydratorRegistry.js)**: Registry with auto-hydrator factory
- **[core/authorize.js](core/authorize.js)**: Core `authorize()` and `authorizeWithFilters()` functions
- **[core/attributeFilters.js](core/attributeFilters.js)**: Attribute filtering logic using Notation library
- **[core/middlewares.js](core/middlewares.js)**: Request middleware for policy context initialization

### Builtin Application Files

- **[builtin/policies/group.js](builtin/policies/group.js)**: Group resource policies
- **[builtin/policies/collection.js](builtin/policies/collection.js)**: Collection resource policies
- **[builtin/policies/utils/](builtin/policies/utils/)**: Shared policies (e.g., `isPlatformAdmin`)
- **[builtin/hydrators/user.js](builtin/hydrators/user.js)**: User hydrator with virtual attributes
- **[builtin/hydrators/context.js](builtin/hydrators/context.js)**: Context hydrator for request-level data
- **[builtin/audit/events.js](builtin/audit/events.js)**: Audit event type enum

## Driving Forces

- **Policies should be easy to understand in isolation**: Pure functions, clear attribute requirements
- **Policy enforcement should be efficient**: Request-scoped caching, incremental hydration
- **Use existing data fetching mechanisms**: Leverage Prisma, don't reinvent the wheel
- **Minimize merge conflicts in derived apps**: Clear layer separation, explicit registration

## Related Documentation

- [Architecture](../../docs/architecture.md): System-wide architecture
- [Custom Extensions](custom/README.md): Guide for derived app developers