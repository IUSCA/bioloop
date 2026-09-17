# Authorization System

## Overview

This is an **Attribute-Based Access Control (ABAC)** implementation with a three-layer architecture designed to minimize merge conflicts when creating derived applications.

## Three-Layer Architecture

```
authorization/
├── core/              # FRAMEWORK LAYER - Never edit in derived apps
│   ├── policies/      # Policy, PolicyContainer, PolicyRegistry
│   ├── hydrators/     # Hydrator base classes and registry
│   ├── pipeline.js    # The decision pipeline the middleware and handlers share
│   ├── capabilities.js
│   ├── requiresCheck.js
│   └── index.js       # Framework exports
│
├── builtin/           # BASE APPLICATION LAYER - Rarely edit in derived apps
│   ├── policies/      # One policy container per resource type
│   ├── hydrators/     # Hydrators for types the default Prisma hydrator cannot serve
│   ├── paths/         # The access rule as SQL, one file per path-based type, and standing
│   ├── tables/        # The access model's tables, read by the reference model in tests
│   ├── lists.js       # Helpers a list route calls
│   └── restrictions.js
│
├── custom/            # DERIVED APPLICATION LAYER - Only exists in derived apps
│
├── index.js           # Configuration: imports, registration, and wiring
└── README.md          # This file
```

### Layer Responsibilities

| Layer | Contains | Edited in Base Repo? | Edited in Derived Apps? |
|-------|----------|----------------------|-------------------------|
| **core/** | Framework classes, authorization engine | ✅ Yes | ❌ Never |
| **builtin/** | Base app policies, hydrators, and paths | ✅ Yes | ⚠️ Rarely |
| **custom/** | Derived app policies, hydrators, and paths | ❌ N/A | ✅ Always |

### What index.js does

`index.js` reads as configuration. Adding a resource type edits it only to import and register:

- a **policy container**, always;
- a **hydrator**, only when the default Prisma hydrator for the model is not enough;
- a **paths file**, only when the type's terms read `context.access_paths`.

A registered paths file also makes a refusal on that type a 404 for a caller with no standing.
The resource's state rules are registered separately, in `src/state/index.js`. The startup check
throws when a policy action has no state rule.

See [custom/README.md](custom/README.md) for the full steps.

### Merge Conflict Strategy

When merging base repo updates into a derived app:

1. **core/ changes**: Auto-accept (you never edit these)
2. **builtin/ changes**: Auto-accept (you rarely edit these)
3. **index.js conflicts**: Simple to resolve:
   - Accept both changes
   - Your custom imports stay in Section 3
   - Your custom registrations stay at the end of each block in Section 4

## Implementation Invariants

- **Policies as pure functions**: A term decides synchronously from the attributes it declares. The startup check rejects an async term.
- **Explicit attribute declarations**: Policies declare exactly what they need (`requires: { user: [...], resource: [...], context: [...] }`)
- **Centralized loaders**: Hydrators manage all data fetching
- **Request-scoped caching**: Avoid redundant database queries within a request
- **One pipeline**: The middleware and `authorizeAction` call the same decision pipeline, so they cannot disagree
- **Separation of concerns**: Policy definition, data loading, and enforcement are separate

## Quick Start

### Authorizing a route

A route binds one action with the middleware. A refusal is answered with 404 or 403 before the
handler runs, and `req.permission.filter` projects the response.

```javascript
const { createAuthorizationMiddleware: authorize } = require('@/authorization');

router.get(
  '/groups/:id',
  authorize('group', 'view_metadata', { shouldDeriveCapabilities: true, shouldDeriveStanding: true }),
  asyncHandler(async (req, res) => {
    const group = await groupService.getGroupById(req.params.id);
    res.json(req.permission.filter(group));
  }),
);
```

A handler that must decide in its body calls `authorizeAction`, and answers with
`decision.status` when `decision.granted` is false:

```javascript
const decision = await authorizeAction('group', 'view_metadata', {
  identifiers: { user: req.user.subject_id, resource: group.id },
  policyExecutionContext: req.policyContext,
  preFetched: { user: req.user, resource: group },
});
```

### Authorizing a list

A list route binds the type's `list` action. Its query scopes the rows, and
`req.permission.filter` gives every row the list's fields. A route whose own decision is about the
resource in the URL, such as a group's ancestors, uses `listFilter(req, type)` instead.
`standingOfRows` and `decideRows` add per-row badges and controls.

@see docs/design/groups/access-model.md — Projection

## Architecture Details

### Policies

A leaf term is a `Policy` with a path kind in `meta`:

```javascript
const isGroupAdmin = new Policy({
  name: 'isGroupAdmin',
  resourceType: 'group',
  meta: { pathKind: 'admin' },
  requires: { context: ['access_paths'] },
  evaluate: (user, group, context) => context.access_paths.kinds.has('admin'),
});
```

#### Policy Combinators

Combine policies using `Policy.or()`, `Policy.and()`, `Policy.not()`:

```javascript
const canView = Policy.or([isGroupAdmin, isGroupMember]);
```

No policy names the platform admin. The pipeline allows a platform admin before any action policy
runs.

### Policy Containers

`PolicyContainer` holds a resource type's actions and attribute rules. Every action declares its
restriction class with `mutating`, `reading`, or `readingData`:

```javascript
const groupPolicies = new PolicyContainer({ resourceType: 'group', version: '1.0.0' });

groupPolicies
  .actions({
    create_child: mutating(isGroupAdmin),
    view_metadata: reading(Policy.or([isGroupAdmin, isGroupMember])),
    list: reading(Policy.always),
  })
  .attributes({
    '*': [
      { policy: isGroupAdmin, attribute_filters: ['*'] },
      { policy: isGroupMember, attribute_filters: ['id', 'name'] },
    ],
  })
  .freeze();
```

A caller sees the union of every matching attribute rule.

### Hydrators

Hydrators fetch entity attributes needed by policies:

```javascript
const userHydrator = new PrismaHydrator({ prismaClient: prisma, modelName: 'user' });

// Register virtual attributes (computed/derived data)
userHydrator.registerVirtualAttribute('current_roles', async ({ id, hydrator }) => {
  const roles = await hydrator.prisma.user_role.findMany({
    where: { user_id: id },
    include: { roles: true },
  });
  return roles.map((r) => r.roles.name);
});
```

### Paths

A path is one way a user reaches a resource: `admin`, `oversight`, `member`, or `grant`. Each
path-based type registers a paths file under `builtin/paths/` that returns one row per path as
SQL. The context hydrator's `access_paths` attribute runs it for one resource, and list services
embed it with `accessibleIdsQuery`, so a check and a list read the same rule.
`builtin/paths/standing.js` turns the rows into `_meta.standing`.

@see [builtin/paths/index.js](builtin/paths/index.js)

## File Organization

### Core Framework Files

See [core/README.md](core/README.md).

### Builtin Application Files

- **[builtin/policies/](builtin/policies/)**: One policy container per resource type; `utils/` holds `isPlatformAdmin`
- **[builtin/policies/base_attributes.js](builtin/policies/base_attributes.js)**: The public attribute lists
- **[builtin/hydrators/](builtin/hydrators/)**: Hydrators with virtual attributes, including `context.access_paths`
- **[builtin/paths/](builtin/paths/)**: The path registry, the path queries, one SQL file per type, and standing
- **[builtin/lists.js](builtin/lists.js)**: `callerIsPlatformAdmin`, `listFilter`, `decideRows`, and `standingOfRows`
- **[builtin/restrictions.js](builtin/restrictions.js)**: The restriction checker injected into the pipeline
- **[builtin/tables/](builtin/tables/)**: The term, action, and attribute tables the reference model reads

## Driving Forces

- **Policies should be easy to understand in isolation**: Pure functions, clear attribute requirements
- **Policy enforcement should be efficient**: Request-scoped caching, incremental hydration
- **Use existing data fetching mechanisms**: Leverage Prisma, don't reinvent the wheel
- **Minimize merge conflicts in derived apps**: Clear layer separation, explicit registration

## Related Documentation

- [Architecture](../../../docs/reference/architecture.md): System-wide architecture
- [Access model](../../../docs/design/groups/access-model.md): Paths, standing, projection, and refusal shapes
- [Custom Extensions](custom/README.md): Guide for derived app developers
