# Worker Development Conventions

## Configuration Pattern

Workers use Python config files:

```python
# workers/config/common.py

CONFIG = {
    'celery': {
        'broker_url': os.getenv('CELERY_BROKER_URL'),
        'result_backend': os.getenv('CELERY_RESULT_BACKEND'),
    },
    'upload': {
        'verify_checksums': False,
        'path': os.getenv('UPLOAD_HOST_DIR', '/opt/sca/data/uploads'),
    },
}
```

---

## Task Definition Pattern

```python
from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_dataset(self, dataset_id):
    """
    Process a dataset.

    Args:
        dataset_id: ID of the dataset to process

    Returns:
        dict: Processing result
    """
    try:
        logger.info(f"Processing dataset {dataset_id}")
        # ...
        return {'status': 'success', 'dataset_id': dataset_id}
    except Exception as exc:
        logger.error(f"Processing failed: {exc}")
        raise self.retry(exc=exc, countdown=60)
```

---

## Logging Pattern

```python
import logging

logger = logging.getLogger(__name__)

# Use structured logging
logger.info(f"[STAGE] Starting staging for dataset {dataset_id}")
logger.warning(f"[STAGE] Missing parameter, using default: {default_value}")
logger.error(f"[STAGE] Failed to process file: {error}", exc_info=True)
```

---

## Workflow Task Pattern

Workflow tasks are special Celery tasks that are part of a Rhythm-orchestrated workflow. They follow a specific signature pattern.

### Standard Task Signature

```python
def workflow_task_name(celery_task, entity_id, **kwargs):
    """
    Task description.

    Args:
        celery_task: WorkflowTask instance (provided by framework)
        entity_id: ID passed from API workflow creation (first element of args array)
        **kwargs: Additional task-specific parameters from workflow definition

    Returns:
        entity_id: Pass entity_id to next workflow step
    """
    logger = logging.getLogger(__name__)
    logger.info(f'[TASK] Processing entity {entity_id}')

    # Task logic here
    # ...

    # Return entity_id for next step
    return entity_id
```

### How Arguments Flow from API to Workers

1. **API creates workflow:**
   ```javascript
   // api/src/routes/entity.js
   const wf = (await wfService.create({
     ...wfBody,
     args: [entityId], // ← Entity ID passed to workflow
   })).data;
   ```

2. **Workflow config defines steps:**
   ```python
   # workers/workers/config/common.py
   WORKFLOWS = {
       'process_entity': {
           'description': 'Process an entity',
           'steps': [
               {
                   'name': 'Step 1',
                   'task': 'process_step_one',
                   'queue': 'bioloop.q',
               },
               {
                   'name': 'Step 2',
                   'task': 'process_step_two',
                   'queue': 'bioloop.q',
               },
           ],
       },
   }
   ```

3. **Worker tasks receive entity_id:**
   ```python
   # workers/workers/tasks/process_step_one.py
   def process_step_one(celery_task, entity_id, **kwargs):
       # entity_id is the value passed in args[0] from API
       logger.info(f'Processing entity {entity_id}')

       # Fetch entity data from API
       entity = api.get_entity(entity_id)

       # Process...

       # Return entity_id for next step
       return entity_id
   ```

### Key Points

1. **First argument after `celery_task` is always the entity ID** - This comes from `args[0]` in workflow creation
2. **`celery_task` is framework-provided** - Don't pass this manually, it's injected by Celery
3. **Return entity_id** - Allows subsequent steps to access the same entity
4. **Use `**kwargs`** - Allows flexibility for additional parameters
5. **API helpers** - Use `workers/workers/api.py` to fetch entity data from API

### Working with Entity Data

Workers should NOT directly access PostgreSQL. Instead, use API helpers:

```python
# workers/workers/api.py provides helper functions
from workers.api import get_dataset, update_dataset

def process_entity(celery_task, entity_id, **kwargs):
    # ✅ CORRECT - Use API helpers
    entity = api.get_entity(entity_id)

    # Process entity
    entity['status'] = 'processed'

    # Update via API
    api.update_entity(entity_id, {'status': 'processed'})

    return entity_id

# ❌ WRONG - Don't access database directly
from workers.db import get_prisma_client
def process_entity(celery_task, entity_id, **kwargs):
    prisma = get_prisma_client()
    entity = prisma.entity.find_unique(where={'id': entity_id})
    # Don't do this!
```

### Task Registration

All workflow tasks must be registered:

```python
# workers/workers/tasks/declarations.py
from workers.tasks.process_step_one import process_step_one
from workers.tasks.process_step_two import process_step_two

# Declare tasks
@shared_task(bind=True, name='process_step_one')
def declared_process_step_one(self, entity_id, **kwargs):
    return process_step_one(self, entity_id, **kwargs)

@shared_task(bind=True, name='process_step_two')
def declared_process_step_two(self, entity_id, **kwargs):
    return process_step_two(self, entity_id, **kwargs)
```

### Full Example: Dataset Staging

```python
# workers/workers/tasks/stage_dataset.py
import logging
from workers import api
from workers.constants import STATES

logger = logging.getLogger(__name__)

def stage_dataset(celery_task, dataset_id, **kwargs):
    """
    Stage a dataset for viewing/download.

    Args:
        celery_task: WorkflowTask instance
        dataset_id: ID of dataset to stage (from workflow args)
        **kwargs: Additional parameters

    Returns:
        dataset_id: For passing to next workflow step
    """
    logger.info(f'[STAGE] Staging dataset {dataset_id}')

    # 1. Fetch dataset from API
    dataset = api.get_dataset(dataset_id)

    if not dataset:
        raise ValueError(f'Dataset {dataset_id} not found')

    # 2. Check if already staged
    if dataset.get('is_staged'):
        logger.info(f'[STAGE] Dataset {dataset_id} already staged')
        return dataset_id

    # 3. Get archive bundle path
    bundle_path = dataset.get('archive_path')
    if not bundle_path:
        raise ValueError(f'Dataset {dataset_id} has no archive')

    # 4. Extract bundle to staging location
    staging_path = extract_bundle(bundle_path, dataset_id)
    logger.info(f'[STAGE] Extracted to {staging_path}')

    # 5. Update dataset via API
    api.update_dataset(dataset_id, {
        'is_staged': True,
        'metadata': {
            **dataset.get('metadata', {}),
            'stage_path': staging_path,
            'staged_at': datetime.utcnow().isoformat(),
        }
    })

    # 6. Add STAGED state
    api.add_dataset_state(dataset_id, STATES.STAGED)

    logger.info(f'[STAGE] Dataset {dataset_id} staged successfully')
    return dataset_id
```

### Workflow Architecture

For comprehensive workflow architecture documentation, see:
- **Architecture Overview:** `.ai/bioloop/architecture.md` → Workflow Architecture
- **API Implementation:** `.ai/bioloop/api_conventions.md` → Workflow Creation Pattern

---

**Last Updated:** 2026-01-27
