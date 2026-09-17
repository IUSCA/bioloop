# Custom Authorization Extensions

This directory is for **derived application** code only. Files in this directory should **never exist** in the base bioloop repository.

## Directory Structure

```
custom/
├── policies/         # Custom resource policies for your application
│   ├── project.js   # Example: Project policy container
│   └── utils/       # Shared custom policies (optional)
├── hydrators/       # Custom hydrators for your resources
│   └── project.js   # Example: Project hydrator
├── paths/           # Custom path SQL, only for types whose terms read access_paths
│   └── project.js   # Example: Project paths
└── README.md        # This file
```

## How to Extend Authorization

When you clone the bioloop repository to create a derived application, follow these steps to add custom authorization:

### 1. Add a Custom Policy

Create a new file in `custom/policies/` for each resource type:

**Example: `custom/policies/project.js`**

Every action declares its restriction class with `mutating`, `reading`, or `readingData`. Every
action needs an attribute rule of its own or a `'*'` rule, or `freeze()` throws. Every
term declares the path kind it confers in `meta`. No policy names the platform-admin role: the
engine allows a platform admin before any action policy runs.

```javascript
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { mutating, reading } = require('../../core/policies/PolicyContainer');

// Optional: Create a resource-specific policy class for convenience
class ProjectPolicy extends Policy {
  constructor({ name, requires, evaluate, meta }) {
    super({
      name,
      resourceType: 'project',
      requires,
      evaluate,
      meta,
    });
  }
}

// Define specific policies for this resource
const isProjectOwner = new ProjectPolicy({
  name: 'isProjectOwner',
  meta: { pathKind: 'self' },
  requires: {
    user: ['id'],
    resource: ['owner_id'],
  },
  evaluate: (user, project) => user.id === project.owner_id,
});

const isProjectMember = new ProjectPolicy({
  name: 'isProjectMember',
  meta: { pathKind: 'member' },
  requires: {
    user: ['project_memberships'],
    resource: ['id'],
  },
  evaluate: (user, project) => user
    .project_memberships
    .some((membership) => membership.project_id === project.id),
});

// Create and configure the policy container
const projectPolicies = new PolicyContainer({
  resourceType: 'project',
  version: '1.0.0',
  description: 'Policies for Project resource',
});

projectPolicies
  .actions({
    create: mutating(Policy.always), // Anyone can create a project
    view: reading(Policy.or([isProjectOwner, isProjectMember])),
    edit: mutating(isProjectOwner),
    delete: mutating(isProjectOwner),
    add_member: mutating(isProjectOwner),
    remove_member: mutating(isProjectOwner),
  })
  .attributes({
    '*': [
      {
        policy: isProjectOwner,
        attribute_filters: ['*'], // All attributes
      },
      {
        policy: isProjectMember,
        attribute_filters: ['id', 'name', 'description', 'created_at'],
      },
    ],
  })
  .freeze();

module.exports = projectPolicies;
```

### 2. Add a Custom Hydrator (if needed)

If your resource requires virtual attributes or custom hydration logic:

**Example: `custom/hydrators/project.js`**

```javascript
const prisma = require('@/db');
const { PrismaHydrator } = require('../../core/hydrators/PrismaHydrator');

const projectHydrator = new PrismaHydrator({ 
  prismaClient: prisma, 
  modelName: 'project', 
  idAttribute: 'id' 
});

// Optional: Register virtual attributes
projectHydrator.registerVirtualAttribute('member_count', async ({ id, hydrator }) => {
  const dbClient = hydrator.prisma;
  const count = await dbClient.project_membership.count({
    where: { project_id: id },
  });
  return count;
});

module.exports = projectHydrator;
```

### 3. Add Custom Paths (only if your terms read `context.access_paths`)

The builtin dataset, collection, and group terms decide from `context.access_paths`: the rows of
one SQL statement naming every path by which a user reaches the resource. A type whose terms read
it registers a paths file. A type whose terms read only user and resource attributes skips this
step, and nothing in `builtin/paths/` needs to change for it.

A paths file exports `{ resourceType, sql, prospectiveKinds }`. `sql(userId, { resourceIds, accessTypes })`
returns rows with the columns `resource_id`, `path_kind`, `group_id`, `grant_id`, `collection_id`,
`access_type`, and `direct`, and may read the `subjects` CTE. `prospectiveKinds` is optional, and
lists the path kinds a create of the type can reach through its owning group. See
[builtin/paths/index.js](../builtin/paths/index.js) and [builtin/paths/collection.js](../builtin/paths/collection.js).

A registered type's refusals are 404 for a caller with no standing on the resource.

### 4. Add State Rules

Every policy action needs a state rule, or startup throws. Create
`src/state/custom/project.js` and register it in `src/state/index.js`. See
[src/state/custom/README.md](../../state/custom/README.md).

### 5. Register in Main Index

After creating your policy/hydrator files, register them in the main `index.js`:

**Edit: `api/src/authorization/index.js`**

```javascript
// ============================================================================
// SECTION 3: IMPORT CUSTOM POLICIES, HYDRATORS & PATHS (derived app code)
// Add your custom policy and hydrator imports here
// ============================================================================
const projectPolicies = require('./custom/policies/project');
const projectHydrator = require('./custom/hydrators/project');
const projectPaths = require('./custom/paths/project');

// ... later in the file ...

// Register derived app policy containers here
policyRegistry.register(projectPolicies);

// ... and for hydrators ...

// Register custom hydrators here
hydratorRegistry.register('project', projectHydrator);

// ... and, only if the type has paths ...

// Register custom paths here
pathRegistry.register(projectPaths);
```

### 6. Place the New Type in the Access Model

The test suite fails until a new container is placed. Three tests read the registry:

- `api/tests/authorization/registryCompleteness.test.js` fails on an action with no restriction
  class and on a term with no path kind.
- `api/tests/model/modelCoverage.test.js` fails on a registered resource type that the reference
  model does not decide. Either extend `MODELLED_RESOURCE_TYPES` and the rule in
  `api/tests/model/reference.js`, or add the type to `NOT_MODELLED` with the test that decides it.
- `api/tests/services/restrictions/restrictions.test.js` fails when an exemption names an action
  no container registers.

See [v2 page patterns — Checklist for a change to the access model](../../../../docs/contributing/v2-page-patterns.md).

## Merge Conflict Strategy

When merging updates from the base bioloop repository:

1. **Core changes**: Automatically accepted (you never edit `core/`)
2. **Builtin changes**: Automatically accepted (you rarely edit `builtin/`)
3. **Index.js conflicts**: 
   - Accept both changes
   - Your custom imports/registrations stay at the bottom of their sections
   - Verify syntax after merge

**Example conflict resolution in `index.js`:**

```javascript
const projectPolicies = require('./custom/policies/project');
const experimentPolicies = require('./custom/policies/experiment');
```

## Guidelines

### DO:
- ✅ Create new files in `custom/policies/`, `custom/hydrators/`, and `custom/paths/`
- ✅ Import and reuse utilities from `core/` and `builtin/`
- ✅ Register your custom policies, hydrators, and paths in `index.js`
- ✅ Follow the naming conventions (PascalCase for classes, camelCase for instances)
- ✅ Use `Policy.or()`, `Policy.and()`, `Policy.not()` to combine policies
- ✅ Freeze your PolicyContainer after configuration

### DON'T:
- ❌ Edit files in `core/` (framework code, will cause merge conflicts)
- ❌ Edit files in `builtin/` unless absolutely necessary
- ❌ Create policies without freezing the container
- ❌ Register policies with conflicting resourceType names
- ❌ Use relative paths that go outside the authorization directory

## Testing Your Custom Policies

Routes bind an action with the authorization middleware. It runs the restriction check, the
platform-admin check, and then the action's policy, and answers a refusal with 404 or 403.

```javascript
const { createAuthorizationMiddleware: authorize } = require('@/authorization');

router.get(
  '/projects/:id',
  authorize('project', 'view'),
  asyncHandler(async (req, res) => {
    const project = await projectService.get(req.params.id);
    res.json(req.permission.filter(project));
  }),
);
```

A handler that decides in its body binds the decision at module load with
`const decideViewProject = require('@/authorization').import('project').action('view')`, calls
`decideViewProject({ identifiers, policyExecutionContext })`,
and answers with `decision.status` when `decision.granted` is false.

## Questions?

Refer to:
- [../../core/README.md](../../core/README.md) - Framework architecture
- [../README.md](../README.md) - Authorization system overview
- [../../builtin/policies/group.js](../../builtin/policies/group.js) - Example policy
- [../../builtin/hydrators/user.js](../../builtin/hydrators/user.js) - Example hydrator with virtual attributes
