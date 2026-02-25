"""
Upload Verification Task

Regular Celery task (NOT a WorkflowTask) for async upload integrity verification.
Uses execute_with_log_tracking to automatically capture all subprocess output.

Handles BLAKE3 manifest verification for large files with:
- Streaming hash (16MB chunks, Lustre-optimized)
- 24-hour timeout
- Auto-retry (max 3 attempts)
- Automatic log capture to database via execute_with_log_tracking

Architecture:
- Celery task (this file): Thin wrapper that spawns subprocess
- Standalone script (verify_upload_integrity.py): All verification logic and error handling
- execute_with_log_tracking(): Captures all subprocess stdout/stderr to database

Note: This is NOT a WorkflowTask - we don't need workflows for upload verification.
The fixed register_process() function handles both WorkflowTask and regular Celery tasks.
"""

import logging

from celery import Celery

from workers import api, cmd
import workers.config.celeryconfig as celeryconfig

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = logging.getLogger(__name__)


def verify_upload_integrity(celery_task, dataset_id):
    """
    Verify upload integrity and update status.
    
    Spawns verification subprocess with automatic log capture to database.
    All verification logic and error handling is in the subprocess script.
    
    Args:
        celery_task: Celery task instance (self)
        dataset_id: Dataset ID to verify
        
    Returns:
        dict: Verification result with status
        
    Raises:
        Various exceptions that Celery will auto-retry
    """
    task_id = celery_task.request.id
    retry_count = celery_task.request.retries
    max_retries = celery_task.max_retries
    
    logger.info(f"Spawning verification subprocess for dataset {dataset_id} (attempt {retry_count + 1}/{max_retries + 1})")
    
    try:
        # Fetch upload log to store worker_process_id later
        upload_log = api.get_dataset_upload_log(dataset_id)
        
        # Run verification as subprocess to automatically capture all logs
        # This uses the same pattern as conversion tasks and other workflow tasks
        # The subprocess script handles ALL the logic and error reporting
        verification_script_cmd = [
            'python', '-m', 'workers.scripts.verify_upload_integrity',
            str(dataset_id),
            str(task_id),
            str(retry_count),
            str(max_retries)
        ]
        
        # execute_with_log_tracking will:
        # 1. Register worker_process with PID and task_id
        # 2. Capture all stdout/stderr from the subprocess
        # 3. Post logs to database in real-time
        # 4. Raise exception if subprocess exits with non-zero code
        cmd.execute_with_log_tracking(
            cmd=verification_script_cmd,
            celery_task=celery_task,
            cwd=None
        )
        
        # Look up worker_process_id by task_id and store in upload_log metadata
        try:
            worker_processes = api.get_worker_processes({'task_id': task_id})
            if worker_processes:
                worker_process_id = worker_processes[0]['id']
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={
                        'metadata': {
                            **(upload_log.get('metadata') or {}),
                            'worker_process_id': worker_process_id,
                        }
                    }
                )
                logger.info(f"✓ Stored worker_process_id {worker_process_id} in upload_log metadata")
        except Exception as e:
            logger.warning(f"Failed to store worker_process_id in upload_log metadata: {e}")
        
        logger.info(f"Verification subprocess completed successfully for dataset {dataset_id}")
        
        return {
            'status': 'success',
            'dataset_id': dataset_id,
        }
        
    except Exception as e:
        # The subprocess handles all error logging and status updates
        # We just need to let Celery retry
        logger.error(f"Verification subprocess failed for dataset {dataset_id}: {e}")
        raise  # Re-raise for Celery to handle retry
