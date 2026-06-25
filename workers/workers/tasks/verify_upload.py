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

from workers import api, cmd

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
    
    upload_log = api.get_dataset_upload_log(dataset_id)
    worker_process_id = None

    try:
        verification_script_cmd = [
            'python', '-m', 'workers.scripts.verify_upload_integrity',
            str(dataset_id),
            str(task_id),
            str(retry_count),
            str(max_retries)
        ]

        worker_process_id = cmd.execute_with_log_tracking(
            cmd=verification_script_cmd,
            celery_task=celery_task,
            cwd=None
        )

        logger.info(f"Verification subprocess completed successfully for dataset {dataset_id}")
        return {
            'status': 'success',
            'dataset_id': dataset_id,
        }

    except cmd.SubprocessError as e:
        # Extract worker_process_id from the error so logs are still accessible in the UI
        error_info = e.args[0] if e.args else {}
        worker_process_id = error_info.get('worker_process_id') or worker_process_id
        logger.error(f"Verification subprocess failed for dataset {dataset_id}: {e}")
        raise

    except Exception as e:
        logger.error(f"Verification subprocess failed for dataset {dataset_id}: {e}")
        raise

    finally:
        # Always store worker_process_id so the UI "Verification Task Logs" card
        # can display logs regardless of whether verification succeeded or failed.
        if worker_process_id:
            try:
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={
                        'metadata': {
                            **(upload_log.get('metadata') or {}),
                            'worker_process_id': worker_process_id,
                        }
                    }
                )
                logger.info(f"Stored worker_process_id {worker_process_id} in upload_log metadata")
            except Exception as e:
                logger.warning(f"Failed to store worker_process_id in upload_log metadata: {e}")
