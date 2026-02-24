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
└── README.md        # This file
```

## How to Extend Authorization

When you clone the bioloop repository to create a derived application, follow these steps to add custom authorization:

### 1. Add a Custom Policy

Create a new file in `custom/policies/` for each resource type:

**Example: `custom/policies/project.js`**

```javascript
const Policy = require('../../../core/policies/Policy');
const PolicyContainer = require('../../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('../../../builtin/policies/utils/index');

// Optional: Create a resource-specific policy class for convenience
class ProjectPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, 
      resourceType: 'project', 
      requires, 
      evaluate,
    });
  }
}

// Define specific policies for this resource
const isProjectOwner = new ProjectPolicy({
  name: 'isProjectOwner',
  requires: {
    user: ['id'],
    resource: ['owner_id'],
  },
  evaluate: (user, project) => user.id === project.owner_id,
});

const isProjectMember = new ProjectPolicy({
  name: 'isProjectMember',
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
    create: Policy.always, // Anyone can create a project
    view: Policy.or([isPlatformAdmin, isProjectOwner, isProjectMember]),
    edit: Policy.or([isPlatformAdmin, isProjectOwner]),
    delete: Policy.or([isPlatformAdmin, isProjectOwner]),
    add_member: Policy.or([isPlatformAdmin, isProjectOwner]),
    remove_member: Policy.or([isPlatformAdmin, isProjectOwner]),
  })
  .attributes({
    '*': [
      {
        policy: Policy.or([isPlatformAdmin, isProjectOwner]),
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
const { PrismaHydrate } = require('../../../core/hydrators/PrismaHydrator');

const projectHydrator = new PrismaHydrate({ 
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

### 3. Register in Main Index

After creating your policy/hydrator files, register them in the main `index.js`:

**Edit: `api/src/authorization/index.js`**

```javascript
// ============================================================================
// SECTION 3: IMPORT CUSTOM POLICIES (derived app code)
// Add your custom policy imports here
// ============================================================================
const projectPolicies = require('./custom/policies/project');

// ... later in the file ...

const POLICY_REGISTRY = {
  // Builtin policies
  group: groupPolicies,
  collection: collectionPolicies,
  
  // Custom policies (add yours here)
  project: projectPolicies,
};

// ... and for hydrators ...

// Register custom hydrators (add yours here)
hydratorRegistry.register('project', require('./custom/hydrators/project'));
```

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
<<<<<<< HEAD (your derived app)
const projectPolicies = require('./custom/policies/project');
const experimentPolicies = require('./custom/policies/experiment');
=======
// (base repo has no changes in this section)
>>>>>>> upstream (base bioloop)

// Keep both:
const projectPolicies = require('./custom/policies/project');
const experimentPolicies = require('./custom/policies/experiment');
```

## Guidelines

### DO:
- ✅ Create new files in `custom/policies/` and `custom/hydrators/`
- ✅ Import and reuse utilities from `core/` and `builtin/`
- ✅ Register your custom policies/hydrators in `index.js`
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

```javascript
// In your route handler:
const { authorize, POLICY_REGISTRY, hydratorRegistry } = require('@/authorization');

router.get('/projects/:id', async (req, res) => {
  const allowed = await authorize(
    POLICY_REGISTRY.project.getAction('view'),
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

## Questions?

Refer to:
- [../../core/README.md](../../core/README.md) - Framework architecture
- [../README.md](../README.md) - Authorization system overview
- [../../builtin/policies/group.js](../../builtin/policies/group.js) - Example policy
- [../../builtin/hydrators/user.js](../../builtin/hydrators/user.js) - Example hydrator with virtual attributes
