# Workflows Feature

**Feature Scope:** Python-based workflow framework for executing multi-step data processing pipelines.

**Status:** Core Platform Feature

---

## Overview

Workflows are multi-step processing pipelines that transform raw data into analysis-ready data products. They are defined in Python and executed by Celery workers.

---

## Workflow Types

### "Integrated" Workflows
- **Definition:** Workflows built into the platform
- **Characteristics:**
  - Defined in `workers/workflows/` directory
  - Version controlled with the platform
  - Automatically available to all users
  - Managed through UI

### Custom Workflows
- **Definition:** User-defined workflows
- **Characteristics:**
  - Can be uploaded by operators/admins
  - Must follow platform workflow API
  - Isolated execution environment

---

## Workflow Execution

### Architecture
1. **Submission:** User submits workflow via UI
2. **Validation:** API validates parameters and inputs
3. **Queue:** Workflow task queued in Redis (Celery)
4. **Execution:** Worker picks up task and executes
5. **Monitoring:** Status updates stored in database
6. **Completion:** Output datasets created and linked

### Status Lifecycle
- `pending` - Queued for execution
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Error occurred
- `cancelled` - User cancelled

---

## Database Schema

### workflow
```prisma
model workflow {
  id                Int       @id @default(autoincrement())
  name              String
  description       String?
  version           String
  workflow_type     String    // "integrated", "custom"
  enabled           Boolean   @default(true)
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
}
```

### workflow_instance
```prisma
model workflow_instance {
  id           Int       @id @default(autoincrement())
  workflow_id  Int
  workflow     workflow  @relation(fields: [workflow_id], references: [id])
  status       String    // pending, running, completed, failed, cancelled
  input_data   Json      // Input parameters and datasets
  output_data  Json?     // Output datasets and results
  started_at   DateTime?
  completed_at DateTime?
  user_id      Int
  user         user      @relation(fields: [user_id], references: [id])
}
```

---

## Workflow Definition Pattern

```python
# workers/workflows/example_workflow.py

from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True)
def execute_workflow(self, workflow_instance_id):
    """
    Execute the workflow.
    
    Args:
        workflow_instance_id: ID of workflow_instance record
    
    Returns:
        dict: Workflow results
    """
    try:
        # 1. Load workflow instance
        instance = load_workflow_instance(workflow_instance_id)
        
        # 2. Validate inputs
        validate_inputs(instance.input_data)
        
        # 3. Execute steps
        step1_result = execute_step1(instance.input_data)
        step2_result = execute_step2(step1_result)
        
        # 4. Create output datasets
        output_datasets = create_output_datasets(step2_result)
        
        # 5. Update instance status
        update_instance_status(workflow_instance_id, 'completed', output_datasets)
        
        return {'status': 'success', 'datasets': output_datasets}
        
    except Exception as exc:
        logger.error(f"Workflow failed: {exc}")
        update_instance_status(workflow_instance_id, 'failed', error=str(exc))
        raise self.retry(exc=exc, countdown=60)
```

---

## API Endpoints

- `GET /workflows` - List available workflows
- `GET /workflows/:id` - Get workflow details
- `POST /workflows/:id/execute` - Submit workflow for execution
- `GET /workflow-instances` - List workflow instances
- `GET /workflow-instances/:id` - Get instance details
- `POST /workflow-instances/:id/cancel` - Cancel running workflow

---

**Last Updated:** 2026-01-16

