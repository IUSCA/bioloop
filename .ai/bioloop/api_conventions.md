# API Development Conventions

## Import Organization

**ALWAYS organize imports at the top of JavaScript files:**

```javascript
// ✅ CORRECT - Imports at the top
const express = require('express');
const { body, param, query } = require('express-validator');
const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const createError = require('http-errors');
const logger = require('@/services/logger');
const datasetService = require('@/services/dataset');

const router = express.Router();
const isPermittedTo = accessControl('datasets');

// Route definitions below...
```

**Import Order (recommended):**
1. External dependencies (express, lodash, etc.)
2. Validation libraries (express-validator)
3. Database clients (`@/db`)
4. Middleware (`@/middleware/*`)
5. Services (`@/services/*`)
6. Utilities (`@/utils/*`)
7. Constants and configuration

**Key Points:**
- All `require()` statements should be at the top of the file
- Avoid importing modules inside route handlers or functions
- Group related imports together
- Use blank lines to separate import groups

---

## Prisma Instance Reuse

**ALWAYS reuse the Prisma instance from `@/db`:**

```javascript
// ✅ CORRECT
const prisma = require('@/db');

router.get('/:id', asyncHandler(async (req, res) => {
  const dataset = await prisma.dataset.findUnique({
    where: { id: req.params.id }
  });
}));
```

**NEVER create new Prisma instances:**
```javascript
// ❌ WRONG
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
```

---

## Transaction Pattern for Multi-Operation Calls

When a single API call needs to perform multiple database operations across different service methods:

**Pattern: Service methods accept optional Prisma/transaction instance**

```javascript
// api/src/services/dataset.js
const prisma = require('@/db');

async function createDataset(data, tx = prisma) {
  return tx.dataset.create({ data });
}

async function linkToProject(datasetId, projectId, tx = prisma) {
  return tx.project_dataset.create({
    data: { dataset_id: datasetId, project_id: projectId }
  });
}

module.exports = { createDataset, linkToProject };
```

```javascript
// api/src/routes/datasets.js
const prisma = require('@/db');
const datasetService = require('@/services/dataset');

router.post('/', asyncHandler(async (req, res) => {
  const { name, type, project_id } = req.body;

  // Use transaction when operations must be atomic
  const result = await prisma.$transaction(async (tx) => {
    // Create dataset
    const dataset = await datasetService.createDataset(
      { name, type, user_id: req.user.id },
      tx
    );

    // Link to project
    await datasetService.linkToProject(dataset.id, project_id, tx);

    // Return full dataset with relation
    return tx.dataset.findUnique({
      where: { id: dataset.id },
      include: { projects: true }
    });
  });

  res.status(201).json({ dataset: result });
}));
```

**Key Points:**
- Service methods default to `prisma` if no transaction provided: `tx = prisma`
- When transaction needed, pass `tx` to all service calls
- Always return the final result from transaction callback
- Use transactions for: create → link, update → audit log, delete → cleanup

---

## Route Handler Structure

**Standard pattern:**
```javascript
const express = require('express');
const { body, param, query } = require('express-validator');
const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const createError = require('http-errors');
const logger = require('@/services/logger');

const router = express.Router();
const isPermittedTo = accessControl('resource_name');

router.get(
  '/:id',
  isPermittedTo('read'),
  [param('id').isInt().toInt()],
  asyncHandler(async (req, res) => {
    const id = req.params.id;

    const resource = await prisma.resource.findUnique({
      where: { id }
    });

    if (!resource) throw createError(404, 'Resource not found');

    res.json({ resource });
  })
);

module.exports = router;
```

**Key Elements:**
1. Use `asyncHandler` for all async route handlers (auto error catching)
2. Use `express-validator` for input validation before handler
3. Use `createError` for HTTP errors (not `throw new Error()`)
4. Use `logger` for logging (not `console.log`)
5. Use `isPermittedTo` middleware for authorization
6. Always validate and sanitize user input

---

## URL Pattern Convention

**User-specific endpoints MUST follow this pattern:**

```
/:username/all              # For listing user's resources
/:username/:id              # For specific user's resource by ID
/:username/subresource      # For user's sub-resources
```

**NOT:**
```
/resource/:username         ❌ WRONG order
/:username                  ❌ WRONG (conflicts with /:id routes)
```

### Examples

**✅ CORRECT:**
```javascript
// Listing user resources
router.get('/:username/all', ...)          // List user's datasets
router.get('/:username/imports', ...)      // List user's import logs

// Specific user resource
router.get('/:username/:id', ...)          // Get user's specific project by ID

// User sub-resources (proper nesting)
router.get('/:username/:id/datasets', ...)  // Get datasets for user's project
```

**❌ WRONG:**
```javascript
router.get('/imports/:username', ...)      // Wrong order
router.get('/:username', ...)              // Conflicts with /:id routes
router.get('/all/:username', ...)          // Wrong order
```

### Why `/:username/all` and Not Just `/:username`?

**Route conflict prevention:**
- `GET /:id` - Get resource by ID (e.g., `/datasets/123`)
- `GET /:username/all` - Get user's resources (e.g., `/datasets/john/all`)

If you use just `/:username`, Express will match it before `/:id`, causing `/datasets/123` to be treated as a username "123" instead of dataset ID 123.

**Use `/:username/all` for listing endpoints to avoid this conflict.**

### Rationale

1. **Semantic clarity** - "Show me USERNAME's RESOURCES" reads naturally
2. **Consistency** - All user-scoped routes follow same pattern
3. **RESTful** - Username acts as a namespace for user-owned resources
4. **Authorization** - `checkOwnership: true` in middleware works with this pattern

### Implementation

```javascript
// User-specific resource list
router.get(
  '/:username/imports',
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res) => {
    const username = req.params.username;
    // Fetch user's imports...
  })
);
```

The `checkOwnership: true` option ensures:
- Regular users can only access their own data
- Admin/operator users can access any user's data

---

## Router Mounting Order

**CRITICAL:** File exposure routers must be mounted **before** global authentication middleware when they require their own authentication mechanism (e.g., cookie-based auth for file serving):

```javascript
// api/src/routes/index.js

// ✅ CORRECT ORDER - when a router has its own auth
const fileExposureRouter = require('./files').fileExposureRouter;

// 1. Mount file exposure (has its own auth)
app.use('/files', fileExposureRouter);

// 2. Global authentication middleware
app.use(authenticate);

// 3. Other protected routes
app.use('/datasets', datasetsRouter);
```

**Reason:** File serving routes may need different auth than the global JWT middleware (e.g., cookie-based auth for direct browser access).

---

## API Response Patterns

**Consistent response structure:**
```javascript
// Single resource
res.json({ dataset });
res.json({ project });

// List with metadata
res.json({
  datasets,
  total: count,
  limit: req.query.limit,
  offset: req.query.offset
});

// Error (use createError)
throw createError(404, 'Resource not found');
throw createError(403, 'Not authorized');
```

---

## Error Handling Pattern

```javascript
const createError = require('http-errors');
const logger = require('@/services/logger');

// ✅ CORRECT
router.get('/:id', asyncHandler(async (req, res) => {
  const resource = await prisma.resource.findUnique({
    where: { id: req.params.id }
  });

  if (!resource) {
    throw createError(404, 'Resource not found');
  }

  res.json({ resource });
}));

// ❌ WRONG
router.get('/:id', async (req, res) => {
  try {
    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id }
    });

    if (!resource) {
      throw new Error('Not found'); // No status code
    }

    res.json({ resource });
  } catch (error) {
    res.status(500).json({ error: error.message }); // Manual error handling
  }
});
```

---

## Logging Pattern

```javascript
const logger = require('@/services/logger');

// API logging
logger.info('[DATASET] Request received');
logger.warn('[STAGE] Unsupported file type:', filePath);
logger.error('[WORKFLOW] Failed to initialize:', error);
```

**When to use logger:**
- API server logs
- Worker task logs
- Production-grade logging

**When to use console.log:**
- CLI scripts for user feedback
- Debug statements during development (remove in production)

---

## Access Control Pattern

**CRITICAL:** Use `isPermittedTo` middleware for authorization. Never manually check ownership or roles in route handlers.

### Standard Pattern

```javascript
const { accessControl } = require('@/middleware/auth');

const router = express.Router();
const isPermittedTo = accessControl('resource_name');

// ✅ CORRECT - Middleware handles authorization
router.post(
  '/:id/action',
  isPermittedTo('update'), // Allows: owner, admin, operator
  asyncHandler(async (req, res) => {
    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id }
    });

    if (!resource) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Proceed with action - authorization already verified
    // ...
  })
);

// ❌ WRONG - Manual ownership check
router.post(
  '/:id/action',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id }
    });

    // Don't do this - middleware already handles it!
    if (resource.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // ...
  })
);
```

### Key Points

1. **Trust the middleware** - If `isPermittedTo` passes, user is authorized
2. **Don't duplicate checks** - Manual checks make code harder to maintain
3. **Log access attempts** - Use `logger` for audit trail, not manual 403s
4. **Consistent errors** - Let middleware provide standard error responses

---

## Workflow Creation Pattern

**CRITICAL:** The Rhythm workflow server generates workflow IDs. Never manually create workflow IDs.

### Pattern Overview

1. Build workflow body from `config.workflow_registry`
2. Call `wfService.create()` with workflow body and args - **Rhythm generates the ID**
3. Create database association using the **returned** workflow ID

### Standard Implementation

```javascript
const wfService = require('@/services/workflow');
const config = require('config');

// ✅ CORRECT - Rhythm generates workflow ID
async function createWorkflowForEntity(entity, wfName, initiatorId) {
  const workflowConfig = config.get('workflow_registry')[wfName];

  if (!workflowConfig) {
    throw new Error(`Workflow ${wfName} not found in workflow_registry`);
  }

  const wfBody = {
    ...workflowConfig,
    name: wfName,
    app_id: config.get('app_id'),
    steps: workflowConfig.steps.map((step) => ({
      ...step,
      queue: step.queue || `${config.get('app_id')}.q`,
    })),
  };

  // Rhythm generates workflow_id
  const wf = (await wfService.create({
    ...wfBody,
    args: [entity.id],
  })).data;

  // Create database association using Rhythm-generated workflow_id
  await prisma.workflow.create({
    data: {
      id: wf.workflow_id, // ← Use ID from Rhythm response
      dataset_id: entity.id,
      initiator_id: initiatorId,
    },
  });

  return wf;
}
```

### Common Mistakes

```javascript
// ❌ WRONG - Manually generating workflow ID
const { v4: uuidv4 } = require('uuid');
const workflowId = uuidv4(); // Don't do this!

// ❌ WRONG - Deleting association on workflow creation failure
try {
  await wfService.create(wfBody);
} catch (error) {
  // Don't delete association if it doesn't exist yet
  await prisma.workflow.deleteMany({ where: { id: workflowId } });
}

// ✅ CORRECT - Create workflow first, THEN create association
const wf = (await wfService.create(wfBody)).data;
await prisma.workflow.create({
  data: { id: wf.workflow_id, dataset_id: datasetId }
});
```

### Key Points

1. **Rhythm generates workflow IDs** - never use `uuid` or manual ID generation
2. **Workflow created first** - then database association
3. **Use returned `workflow_id`** - from `wfService.create()` response
4. **Don't delete on failure** - if workflow creation fails, there's no association to delete
5. **Pass entity ID as args** - `args: [entityId]` makes ID available to workflow tasks
6. **Build consistent wfBody** - name, app_id, steps with queues

---

## Quick Reference Checklist

### Starting New API Route
- [ ] Import `prisma` from `@/db`
- [ ] Use `asyncHandler` for route handler
- [ ] Add `express-validator` validation
- [ ] Use `isPermittedTo` for authorization
- [ ] **Trust `isPermittedTo` - no manual ownership checks**
- [ ] Use `createError` for HTTP errors
- [ ] Use `logger` for logging
- [ ] Check if service methods need transaction support

### Creating Workflows
- [ ] Get workflow config from `config.workflow_registry`
- [ ] Build wfBody with name, app_id, and mapped steps
- [ ] Call `wfService.create()` with args - **Rhythm generates ID**
- [ ] Create database association with returned `workflow_id`
- [ ] Never manually generate workflow IDs
- [ ] Never delete association in catch block (it doesn't exist yet)
- [ ] Use `isPermittedTo` for authorization - no manual checks

---

**Last Updated:** 2026-01-27
