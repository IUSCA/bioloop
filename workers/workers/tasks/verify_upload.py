"""Celery task that verifies the files of an uploaded dataset.

The task hashes what landed at the dataset's origin_path, compares it against
the manifest the browser computed, and writes VERIFIED or VERIFICATION_FAILED to
the upload log. Retries, time limits, and the retry counter all come from the
task declaration in workers/workers/tasks/declarations.py.

This is a plain Celery task rather than a WorkflowTask, so it can be dispatched
with .delay() without a workflow wrapping it.

@see docs/reference/features/dataset-upload.md — Verification
"""

import logging
from datetime import datetime

from workers import api, log_tracking, upload
from workers.config import config
from workers.constants.upload import UPLOAD_STATUS

logger = logging.getLogger(__name__)


def verify_upload_integrity(celery_task, dataset_id):
    """Verify one dataset's uploaded files and record the outcome.

    Args:
        celery_task: the bound Celery task, read for its retry counter and id.
        dataset_id: the dataset to verify.

    Returns:
        dict: {'status': 'success', 'dataset_id': <id>} when verification passes.

    Raises:
        Exception: whatever upload.verify_upload_integrity raised, re-raised
            unchanged so Celery's autoretry sees the real type. The final
            attempt also writes VERIFICATION_FAILED and notifies an admin.
    """
    retry_count = celery_task.request.retries
    max_retries = celery_task.max_retries
    is_final_attempt = retry_count >= max_retries

    tag = f'verify_upload_integrity dataset={dataset_id}'
    with log_tracking.track_task_logs(celery_task, tag=tag) as worker_process_id:
        logger.info(
            f'Verifying upload for dataset {dataset_id}, '
            f'attempt {retry_count + 1} of {max_retries + 1}'
        )

        upload_log = api.get_dataset_upload_log(dataset_id)

        # Recorded before the work starts, not after. The upload detail page
        # reads this id to find the log lines, so storing it up front is what
        # makes progress visible while a long hash is still running.
        _store_worker_process_id(dataset_id, upload_log, worker_process_id)

        try:
            dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)
            logger.info(
                f'Dataset {dataset.get("name")} at {dataset.get("origin_path")}, '
                f'upload status {upload_log.get("status")}'
            )
            logger.info('Hashing the uploaded files. Large datasets take hours.')

            upload.verify_upload_integrity(dataset, upload_log)

            api.update_dataset_upload_log(
                dataset_id=dataset_id,
                log_data={'status': UPLOAD_STATUS['VERIFIED']},
            )
            logger.info(
                f'Verification passed, status is now {UPLOAD_STATUS["VERIFIED"]}. '
                f'manage_upload_workflows starts the integrated workflow on its next run.'
            )
            return {'status': 'success', 'dataset_id': dataset_id}

        except Exception as e:
            logger.error(
                f'Verification failed for dataset {dataset_id}: '
                f'{type(e).__name__}: {e}',
                exc_info=True,
            )
            if not is_final_attempt:
                logger.info(
                    f'Celery retries in {celery_task.default_retry_delay} seconds, '
                    f'attempt {retry_count + 2} of {max_retries + 1}.'
                )
                raise

            _record_permanent_failure(
                dataset_id=dataset_id,
                dataset_name=(upload_log.get('dataset') or {}).get('name'),
                task_id=celery_task.request.id,
                attempts=retry_count + 1,
                error=e,
            )
            raise


def _store_worker_process_id(dataset_id, upload_log, worker_process_id):
    """Put the worker process id in the upload log's metadata for the UI.

    Does nothing when the process could not be registered. Never raises: losing
    the link to the logs must not fail the verification.
    """
    if not worker_process_id:
        return
    try:
        api.update_dataset_upload_log(
            dataset_id=dataset_id,
            log_data={
                'metadata': {
                    **(upload_log.get('metadata') or {}),
                    'worker_process_id': worker_process_id,
                }
            },
        )
    except Exception as e:
        logger.warning(f'Failed to store worker_process_id in upload log metadata: {e}')


def _record_permanent_failure(dataset_id, dataset_name, task_id, attempts, error):
    """Mark the upload as VERIFICATION_FAILED and notify an admin.

    Called only on the last attempt. Each step is guarded, so a failure to write
    the status still lets the notification go out and vice versa.
    """
    logger.error(
        f'This was the final attempt. Setting status to '
        f'{UPLOAD_STATUS["VERIFICATION_FAILED"]}. An admin should check that the '
        f'files exist at origin_path, that the filesystem is reachable, and that '
        f'the blake3 library is installed.'
    )

    try:
        api.update_dataset_upload_log(
            dataset_id=dataset_id,
            log_data={
                'status': UPLOAD_STATUS['VERIFICATION_FAILED'],
                'metadata': {
                    'failure_reason': f'{type(error).__name__}: {error}',
                    'task_id': task_id,
                    'failed_at': datetime.utcnow().isoformat(),
                    'retries_exhausted': True,
                },
            },
        )
    except Exception as e:
        # manage_upload_workflows re-applies this status when it sees the task
        # in FAILURE with the upload still VERIFYING.
        logger.error(f'Failed to write VERIFICATION_FAILED status: {e}')

    if not config.get('enabled_features', {}).get('notifications', False):
        logger.info('Notifications are disabled, skipping the admin notification.')
        return

    try:
        api.create_notification({
            'title': f'Upload Verification Failed: {dataset_name or dataset_id}',
            'message': (
                f'Upload verification permanently failed after {attempts} attempts.\n\n'
                f'Dataset ID: {dataset_id}\n'
                f'Dataset Name: {dataset_name}\n'
                f'Task ID: {task_id}\n'
                f'Error: {error}\n\n'
                f'Manual intervention required. '
                f'View the logs at /datasets/uploads/{dataset_id}.'
            ),
            'type': 'error',
            'metadata': {
                'dataset_id': dataset_id,
                'task_id': task_id,
                'error': str(error),
                'timestamp': datetime.utcnow().isoformat(),
            },
        })
        logger.info('Admin notification sent.')
    except Exception as e:
        logger.error(f'Failed to send the admin notification: {e}')
