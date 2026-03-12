# Bioloop Platform Architecture

## Overview

Bioloop is a **microservice architecture** with separate UI, API, and Worker components.

**Always consider the impact of changes across all services.**

---

## Service Components

### UI (Vue.js)
- **Technology:** Vue 3 with Vuestic UI component library
- **Port:** 3000 (development), proxied via Nginx in production
- **Responsibilities:**
  - User interface and interactions
  - Client-side validation
  - API consumption

### API (Node.js/Express)
- **Technology:** Express.js with Prisma ORM
- **Port:** 3001 (development), 3000 (production via Nginx)
- **Responsibilities:**
  - RESTful API endpoints
  - Authentication & authorization
  - Database operations
  - File serving and exposure
  - Job submission to workers

### Workers (Python/Celery)
- **Technology:** Python with Celery task queue
- **Queue:** Redis (broker and result backend)
- **Responsibilities:**
  - Asynchronous task processing
  - Long-running computations
  - Workflow execution

---

## Database Architecture

### PostgreSQL
- **Purpose:** Primary data store
- **ORM:** Prisma (schema in `api/prisma/schema.prisma`)
- **Naming Convention:** `snake_case` for all models and fields

### Redis
- **Purpose:** Celery broker and result backend
- **Port:** 6379

### MongoDB
- **Purpose:** Task metadata and worker state (legacy)
- **Status:** Being phased out in favor of PostgreSQL

---

## Cross-Service Communication

### API → Workers
- Celery tasks submitted via Redis queue
- Task results stored in Redis backend
- API polls for task completion

### UI → API
- RESTful HTTP requests
- JWT-based authentication

### Workers → API
- Task status updates via database
- No direct HTTP calls from workers to API

---

## Key Architectural Patterns

### Authentication Flow
1. User logs in via UI
2. API validates credentials and issues JWT
3. JWT stored in httpOnly cookie
4. API middleware validates JWT on each request

### File Serving Pattern
1. Files stored on filesystem (not in database)
2. Database stores file metadata and paths
3. API serves files via `/files/expose/` routes

### Data Consistency
- Use Prisma transactions for multi-operation updates
- Cascade deletes configured at database level
- Optimistic locking for concurrent updates where needed

---

## Workflow Architecture

Bioloop uses **Rhythm** (an external workflow orchestration service) to manage long-running asynchronous tasks. Understanding the workflow architecture is critical for implementing any feature that requires background processing.

### Components

1. **Rhythm Workflow Server** - External service that orchestrates workflow execution
   - Generates unique workflow IDs
   - Manages workflow lifecycle (pending, running, completed, failed)
   - Stores workflow state and task execution history
   - API: `wfService` in `api/src/services/workflow.js`

2. **Workflow Registry** - Configuration defining available workflows
   - Location: `api/config/default.json` → `workflow_registry`
   - Location: `workers/workers/config/common.py` → `WORKFLOWS`
   - Each workflow has: name, description, steps (tasks)

3. **Worker Tasks** - Python functions that execute workflow steps
   - Location: `workers/workers/tasks/*.py`
   - Registered in: `workers/workers/tasks/declarations.py`
   - Execute via Celery queue system

4. **Database Associations** - Tracking which workflows belong to which entities
   - `workflow` table: Links workflows to datasets
   - Other entity-specific tables as needed

### Workflow Creation Pattern

**CRITICAL:** Rhythm generates workflow IDs. Never manually create workflow IDs.

#### Standard Flow

```
1. API receives workflow request
2. API builds workflow body from config
3. API calls Rhythm to create workflow (Rhythm generates ID)
4. API creates database association using Rhythm-generated ID
5. Rhythm queues tasks for Celery workers
6. Workers execute tasks and update status
```

#### Implementation Pattern

```javascript
// api/src/routes/entity.js
const wfService = require('@/services/workflow');
const config = require('config');

router.post('/:id/workflows/:wf', asyncHandler(async (req, res) => {
  const entityId = req.params.id;
  const wfName = req.params.wf;

  // 1. Get workflow definition from config
  const workflowConfig = config.get('workflow_registry')[wfName];

  // 2. Build workflow body
  const wfBody = {
    ...workflowConfig,
    name: wfName,
    app_id: config.get('app_id'),
    steps: workflowConfig.steps.map((step) => ({
      ...step,
      queue: step.queue || `${config.get('app_id')}.q`,
    })),
  };

  // 3. Create workflow via Rhythm (Rhythm generates ID)
  const wf = (await wfService.create({
    ...wfBody,
    args: [entityId], // Pass entity ID to tasks
  })).data;

  // 4. Create database association with Rhythm-generated ID
  await prisma.workflow.create({
    data: {
      id: wf.workflow_id, // ← From Rhythm
      dataset_id: entityId,
      initiator_id: req.user.id,
    },
  });

  return res.json(wf);
}));
```

#### Key Principles

1. **Rhythm is authoritative** - Never generate workflow IDs manually (no `uuid`)
2. **Create workflow first** - Then create database association
3. **Use returned ID** - Always use `wf.workflow_id` from Rhythm response
4. **Pass entity ID as args** - Makes entity ID available to all workflow tasks
5. **No cleanup in catch** - If workflow creation fails, there's no association to delete

### Workflow Arguments

When creating a workflow, pass entity IDs as `args`:

```javascript
// API creates workflow
await wfService.create({
  ...wfBody,
  args: [datasetId], // or [entityId], etc.
});
```

Workers receive these args in their task functions:

```python
# workers/workers/tasks/some_task.py
def process_entity(celery_task, entity_id, **kwargs):
    """
    Args:
        celery_task: WorkflowTask instance (provided by framework)
        entity_id: First element from workflow args array
        **kwargs: Additional task-specific parameters
    """
    # Use entity_id to fetch data and process
    pass
```

### Workflow States

Workflows progress through these states:
- **PENDING** - Created, waiting to start
- **RUNNING** - Currently executing
- **COMPLETED** - Finished successfully
- **FAILED** - Encountered error
- **PAUSED** - Manually paused
- **CANCELLED** - Manually cancelled

### Entity-Workflow Associations

#### Standard Pattern (One-to-Many)
```javascript
// workflow table has dataset_id column
await prisma.workflow.create({
  data: {
    id: wf.workflow_id,
    dataset_id: datasetId,
    initiator_id: userId,
  },
});
```

#### Junction Table Pattern (Many-to-Many)
```javascript
// entity_workflow junction table for entities that can share workflows
await prisma.entity_workflow.create({
  data: {
    entity_id: entityId,
    workflow_id: wf.workflow_id,
    initiator_id: userId,
  },
});
```

Choose pattern based on:
- **One-to-many** (entity has many workflows): Use entity_id column in `workflow` table
- **Many-to-many** (multiple entities can share workflows): Use junction table

### Error Handling

```javascript
// ✅ CORRECT - Simple, no unnecessary cleanup
let wf;
try {
  wf = (await wfService.create({ ...wfBody, args: [entityId] })).data;
  logger.info(`Workflow ${wf.workflow_id} created`);
} catch (error) {
  logger.error('Failed to create workflow:', error);
  return res.status(500).json({ error: 'Failed to create workflow' });
}

// Create association after successful creation
await prisma.workflow.create({
  data: { dataset_id: entityId, id: wf.workflow_id }
});

// ❌ WRONG - Don't delete association that doesn't exist yet
try {
  const wf = await wfService.create(wfBody);
  await prisma.workflow.create({ ... });
} catch (error) {
  // Don't do this - association may not exist
  await prisma.workflow.deleteMany({ where: { id: workflowId } });
}
```

### Common Workflows

**Dataset Workflows:**
- `integrated` - Full dataset processing (inspect, archive, validate)
- `stage` - Stage dataset for viewing/download
- `delete` - Delete archived dataset

### Debugging Workflows

1. **Check Rhythm status:**
   ```bash
   curl http://localhost:4000/workflows/{workflow_id}
   ```

2. **Check database association:**
   ```sql
   SELECT * FROM workflow WHERE id = '{workflow_id}';
   ```

3. **Check worker logs:**
   ```bash
   docker logs bioloop-worker-1
   # or in production
   pm2 logs worker
   ```

4. **Check task queue:**
   ```bash
   docker exec -it bioloop-redis-1 redis-cli
   LLEN bioloop.q  # Check queue length
   ```

### Further Reading

- **API Implementation:** `.ai/bioloop/api_conventions.md` → Workflow Creation Pattern
- **Worker Implementation:** `.ai/bioloop/worker_conventions.md` → Task Implementation
- **Example Workflows:** `api/config/default.json` → `workflow_registry`

---

## Environment-Specific Behavior

### Development
- Hot module replacement (HMR) enabled
- Detailed logging
- CORS permissive
- Direct service access (no Nginx)

### Production
- Nginx reverse proxy
- Compressed responses (except binary files)
- Secure cookies (HTTPS only)
- Rate limiting
- Access logs

---

## Environment Variables & Configuration

### Bioloop Convention: `.env` Files Over Exported Variables

**ALWAYS use `.env` files for configuration instead of requiring developers to export environment variables.**

**✅ CORRECT Pattern:**
```bash
# Add to .env file
echo "LOG_LEVEL=debug" >> .env

# Script reads from .env automatically
node script.js
```

**❌ WRONG Pattern:**
```bash
# Don't require manual exports
export LOG_LEVEL=debug
node script.js
```

### Implementation

**In JavaScript/Node.js:**
```javascript
// At the top of your script
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Access variables
const logLevel = process.env.LOG_LEVEL || 'info';
const apiKey = process.env.API_KEY;
```

**In Python:**
```python
from dotenv import load_dotenv
import os

# Load .env file
load_dotenv()

# Access variables
log_level = os.getenv('LOG_LEVEL', 'info')
api_key = os.getenv('API_KEY')
```

### Rationale

1. **Persistence:** `.env` files persist across sessions and terminal windows
2. **Documentation:** Configuration is self-documenting in the repository
3. **Version Control:** `.env.default` provides examples, `.env` is gitignored for secrets
4. **Consistency:** Same pattern across API, Workers, and utility scripts
5. **CI/CD Friendly:** Easier to automate in deployment pipelines

### File Structure

Each service/directory should have:
- **`.env.default`** - Committed to git, contains example values and documentation
- **`.env`** - Gitignored, contains actual credentials and local overrides

### Priority Order

Configuration is read in this order (later overrides earlier):
1. `.env.default` - Default values
2. `.env` - Local overrides
3. `process.env` / environment - Runtime overrides (for Docker/CI)

### Examples in Bioloop

- **API:** `api/.env` for database credentials, JWT secrets, external service URLs
- **Workers:** `workers/.env` for Celery configuration, data paths
- **UI:** `ui/.env` for API URL, build-time configuration

**Note:** Feature enablement (Downloads, Uploads, Imports) is controlled via `config/*.json` files, NOT `.env` files.

---

## Critical Cross-Service Dependencies

1. **Prisma Schema Changes**
   - Requires: `npx prisma generate` in API
   - Requires: API restart
   - May require: Worker restart if workers use Prisma models

2. **Constants Changes**
   - Update in: `api/src/constants.js`, `ui/src/constants.js`, `workers/config/common.py`
   - Requires: Service restart only if config files changed

3. **Database Migrations**
   - Run in: API service
   - Affects: All services that access database
   - Coordination: Must be run before deploying code changes

---

## Service Restart Requirements

### Requires Restart
- Config file changes (`config/*.json`)
- New npm/pip package installed
- Prisma schema changes (after `npx prisma generate`)
- Environment variable changes
- Docker container rebuild

### Does NOT Require Restart
- API route changes (HMR)
- UI component changes (HMR)
- Service function changes (HMR)
- Database data changes (only structure requires restart)

---

**Last Updated:** 2026-01-27
