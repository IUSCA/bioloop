"""
Manage Upload Workflows - TUS Upload Retry Job

This script manages TUS upload workflows by:
1. Retrying stalled uploads (UPLOADED but workflow not started)
2. Managing VERIFYING status with async Celery task
3. Retrying failed processing workflows (up to 3 times)
4. Marking permanently failed uploads after 3 failures
5. Sending admin notifications for permanent failures

Designed to run every 1 minute via PM2 cron.

Usage:
    # Actually retry workflows (default)
    python -m workers.scripts.manage_upload_workflows
    
    # Dry run mode
    python -m workers.scripts.manage_upload_workflows --dry-run=True
    
    # Custom retry threshold
    python -m workers.scripts.manage_upload_workflows --max-retries=3
"""

import logging
import uuid
from datetime import datetime, timedelta

import fire
from celery import Celery
from sca_rhythm import Workflow

import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
from workers import api
from workers.config import config
from workers.constants.upload import MAX_RETRY_COUNT, UPLOAD_STATUS
from workers.constants.workflow import WORKFLOWS

celery_app = Celery("tasks")
celery_app.config_from_object(celeryconfig)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def manage_upload_workflows(dry_run=False, max_retries=MAX_RETRY_COUNT):
    """
    Manage upload workflows by retrying stalled and failed uploads.
    
    Args:
        dry_run (bool): If True, simulates the process without making actual changes
        max_retries (int): Maximum number of retry attempts before permanent failure
    
    Returns:
        dict: Summary of operations performed
    """
    logger.info("="*60)
    logger.info("Starting upload workflow management")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"Max retries: {max_retries}")
    logger.info("="*60)
    
    summary = {
        'verification_spawned': 0,
        'verified_triggered': 0,
        'verification_failed': 0,
        'failed_retried': 0,
        'permanently_failed': 0,
        'stale_uploading_failed': 0,
        'errors': 0,
    }

    # Expire stale UPLOADING sessions first so their names are freed before
    # we process any new uploads with the same names.
    try:
        stale_summary = process_stale_uploading(dry_run)
        summary['stale_uploading_failed'] = stale_summary.get('failed', 0)
        summary['errors'] += stale_summary['errors']
    except Exception as e:
        logger.error(f"Error processing stale UPLOADING records: {e}", exc_info=True)
        summary['errors'] += 1

    try:
        stalled_summary = process_stalled_uploads(dry_run)
        summary['verification_spawned'] = stalled_summary.get('verification_spawned', 0)
        summary['verified_triggered'] = stalled_summary.get('verified_triggered', 0)
        summary['verification_failed'] = stalled_summary.get('verification_failed', 0)
        summary['errors'] += stalled_summary['errors']
    except Exception as e:
        logger.error(f"Error processing stalled uploads: {e}", exc_info=True)
        summary['errors'] += 1
    
    try:
        failed_summary = process_failed_uploads(dry_run, max_retries)
        summary['failed_retried'] = failed_summary['retried']
        summary['permanently_failed'] = failed_summary['permanently_failed']
        summary['errors'] += failed_summary['errors']
    except Exception as e:
        logger.error(f"Error processing failed uploads: {e}", exc_info=True)
        summary['errors'] += 1
    
    logger.info("="*60)
    logger.info("Upload workflow management complete")
    logger.info(f"Stale UPLOADING sessions expired: {summary['stale_uploading_failed']}")
    logger.info(f"Verification tasks spawned: {summary['verification_spawned']}")
    logger.info(f"Verified uploads (workflow triggered): {summary['verified_triggered']}")
    logger.info(f"Failed uploads retried: {summary['failed_retried']}")
    logger.info(f"Uploads marked permanently failed: {summary['permanently_failed']}")
    logger.info(f"Errors: {summary['errors']}")
    logger.info("="*60)
    
    return summary


def process_stale_uploading(dry_run=False, age_days=0.25):
    """
    Transition uploads that have been stuck in UPLOADING for more than *age_days*
    to UPLOAD_FAILED.

    The default threshold of 0.25 days (6 hours) is intentionally generous.
    A 100 GB upload over a slow research-network connection (100 Mbps) takes
    roughly 2.2 hours, so 6 hours gives ample margin before declaring a session
    abandoned.  Reduce it only if you know uploads will never take that long
    on your network.

    Scenarios that leave an upload stuck in UPLOADING:
      - User closed the browser before /complete was called
      - Token expired mid-transfer and the client gave up
      - TUS onUploadCreate returned a non-retryable error (400/403/409)
      - onUploadFinish failed with a filesystem error

    Transitioning to UPLOAD_FAILED:
      - Frees the dataset name for re-upload (the API tombstones the dataset
        on UPLOAD_FAILED writes via the PATCH /:id/upload-log endpoint)
      - Surfaces a visible failure status in the upload history UI
      - Prevents infinite "Uploading…" spinners in the admin view

    Returns a summary dict with keys 'failed' and 'errors'.
    """
    logger.info("\n" + "="*80)
    logger.info("EXPIRING STALE UPLOADING SESSIONS")
    logger.info(f"  Age threshold: {age_days} day(s) ({age_days * 24:.1f} hours)")
    logger.info("="*80)

    summary = {'failed': 0, 'errors': 0}

    try:
        response = api.get_expired_uploads(status=UPLOAD_STATUS['UPLOADING'], age_days=age_days)
        uploads = response.get('uploads', [])
        logger.info(f"Found {len(uploads)} stale UPLOADING session(s)")

        for upload in uploads:
            dataset_id = upload['dataset_id']
            dataset_name = upload['dataset_name']
            try:
                logger.info(f"  Expiring stale upload: {dataset_name} (ID: {dataset_id})")
                if not dry_run:
                    api.update_dataset_upload_log(
                        dataset_id=dataset_id,
                        log_data={
                            'status': UPLOAD_STATUS['UPLOAD_FAILED'],
                            'metadata': {
                                'failure_reason': (
                                    f'Upload session expired after {age_days * 24:.1f} hour(s) '
                                    f'in UPLOADING state. The browser tab may have been '
                                    f'closed, the session timed out, or a server-side '
                                    f'error occurred before the upload could complete.'
                                ),
                            },
                        },
                    )
                    summary['failed'] += 1
                    logger.info(f"    → UPLOAD_FAILED (name freed for re-upload)")
                else:
                    logger.info(f"    → [dry-run] would set UPLOAD_FAILED")
            except Exception as e:
                logger.error(f"  Error expiring upload {dataset_id}: {e}", exc_info=True)
                summary['errors'] += 1

    except Exception as e:
        logger.error(f"Error fetching stale UPLOADING records: {e}", exc_info=True)
        summary['errors'] += 1

    return summary


def process_stalled_uploads(dry_run=False):
    """
    Process uploads that need verification or workflow triggering.
    
    Handles three upload states:
    1. UPLOADED -> Spawn async verification task (set VERIFYING)
    2. VERIFYING -> Check task status and handle all failure modes
    3. VERIFIED -> Trigger integrated workflow (set COMPLETE)
    
    Args:
        dry_run (bool): If True, simulates without making changes
    
    Returns:
        dict: Summary of uploads processed
    """
    logger.info("\n" + "="*80)
    logger.info("PROCESSING STALLED UPLOADS")
    logger.info("="*80)
    
    summary = {
        'verification_spawned': 0,
        'verified_triggered': 0,
        'verification_failed': 0,
        'errors': 0,
    }
    
    from workers.tasks.declarations import verify_upload_integrity as verify_task
    
    try:
        response = api.get_stalled_uploads()
        uploads = response.get('uploads', [])
        
        logger.info(f"Found {len(uploads)} uploads needing processing\n")
        
        for upload in uploads:
            dataset_id = upload['dataset_id']
            dataset_name = upload['dataset_name']
            uploaded_at = upload['uploaded_at']
            
            try:
                dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)
                upload_log = api.get_dataset_upload_log(dataset_id)
                current_status = upload_log.get('status')
                metadata = upload_log.get('metadata') or {}
                
                logger.info("-" * 80)
                logger.info(f"Upload: {dataset_name} (ID: {dataset_id})")
                logger.info(f"Status: {current_status}")
                logger.info(f"Uploaded at: {uploaded_at}")
                
                if current_status == UPLOAD_STATUS['UPLOADED']:
                    result = handle_uploaded_status(
                        dataset_id, dataset_name, upload_log, metadata, dry_run, verify_task
                    )
                    summary[result] += 1
                    
                elif current_status == UPLOAD_STATUS['VERIFYING']:
                    result = handle_verifying_status(
                        dataset_id, dataset_name, upload_log, metadata, dry_run, verify_task
                    )
                    summary[result] += 1
                    
                elif current_status == UPLOAD_STATUS['VERIFIED']:
                    result = handle_verified_status(
                        dataset_id, dataset_name, dataset, dry_run
                    )
                    summary[result] += 1
                    
                else:
                    logger.warning(f"Unexpected status {current_status}, skipping")
                    
            except Exception as e:
                logger.error("="*80)
                logger.error("FAILURE MODE: EXCEPTION IN UPLOAD PROCESSING")
                logger.error(f"Dataset ID: {dataset_id}")
                logger.error(f"Dataset name: {dataset_name}")
                logger.error(f"Error: {str(e)}")
                logger.error(f"Error type: {type(e).__name__}")
                logger.error("Expected resolution: Error logged, will retry on next script run")
                logger.error("                     Check if API is accessible")
                logger.error("                     Check if dataset/upload_log exists")
                logger.error("="*80)
                summary['errors'] += 1
    
    except Exception as e:
        logger.error("="*80)
        logger.error("FAILURE MODE: FAILED TO FETCH STALLED UPLOADS")
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error("Expected resolution: Check if API is accessible")
        logger.error("                     Will retry on next script run")
        logger.error("="*80)
        summary['errors'] += 1
    
    logger.info("\n" + "="*80)
    logger.info("STALLED UPLOADS SUMMARY")
    logger.info(f"Verification tasks spawned: {summary['verification_spawned']}")
    logger.info(f"Verified uploads (workflow triggered): {summary['verified_triggered']}")
    logger.info(f"Verification failures: {summary['verification_failed']}")
    logger.info(f"Errors: {summary['errors']}")
    logger.info("="*80)
    
    return summary


def handle_uploaded_status(dataset_id, dataset_name, upload_log, metadata, dry_run, verify_task):
    """
    Handle upload with UPLOADED status - spawn verification task.
    
    Task is idempotent - verification can be run multiple times safely.
    However, we prevent duplicate spawns by checking for existing running tasks.
    
    Returns:
        str: Result key for summary ('verification_spawned' or 'errors')
    """
    logger.info("Action: Spawn verification task")
    
    if dry_run:
        logger.info("[DRY RUN] Would set status to VERIFYING and spawn task")
        return 'verification_spawned'
    
    try:
        # Pre-generate the task ID so status, task ID, and timestamp are all
        # written in a single API call before the task is enqueued.  This closes
        # the two-write gap where a crash between Write-1 (VERIFYING) and Write-2
        # (task_id metadata) would leave the DB without a task ID to inspect.
        task_id = str(uuid.uuid4())

        logger.info(f"Setting status to VERIFYING and persisting task ID {task_id}...")
        api.update_dataset_upload_log(
            dataset_id=dataset_id,
            log_data={
                'status': UPLOAD_STATUS['VERIFYING'],
                'metadata': {
                    **metadata,
                    'verification_task_id': task_id,
                    'verification_started_at': datetime.utcnow().isoformat(),
                }
            }
        )
        logger.info(f"✓ Status set to VERIFYING, task ID persisted: {task_id}")

        logger.info("Enqueuing verification task...")
        verify_task.apply_async(args=[dataset_id], task_id=task_id)
        logger.info(f"✓ Verification task enqueued: {task_id}")
        logger.info("Expected resolution: Task will verify integrity and update status")
        logger.info("                     Next script run will check task state")
        logger.info("Idempotency note: Verification is idempotent - safe to run multiple times")
        logger.info("                  Task ID acts as distributed lock to prevent duplicate spawns")
        
        return 'verification_spawned'
        
    except Exception as e:
        logger.error("="*80)
        logger.error("FAILURE MODE: FAILED TO SPAWN VERIFICATION TASK")
        logger.error(f"Dataset ID: {dataset_id}")
        logger.error(f"Dataset name: {dataset_name}")
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error("Possible causes:")
        logger.error("  - RabbitMQ/Celery broker unreachable")
        logger.error("  - API endpoint failed")
        logger.error("  - Network issue")
        logger.error("Expected resolution: Upload remains in UPLOADED status")
        logger.error("                     Will retry on next script run (1 minute)")
        logger.error("="*80)
        return 'errors'


def handle_verifying_status(dataset_id, dataset_name, upload_log, metadata, dry_run, verify_task):
    """
    Handle upload with VERIFYING status - check task state.
    
    Handles all failure modes:
    - Task completed successfully but status not updated
    - Task still running
    - Task failed
    - Task stale (no task_id but VERIFYING for >5 min)
    - Task hung (VERIFYING for >4 hours)
    
    Returns:
        str: Result key for summary
    """
    logger.info("Action: Check verification task state")
    
    task_id = metadata.get('verification_task_id')
    verification_started_at = metadata.get('verification_started_at')
    updated_at = upload_log.get('updated_at')
    
    if verification_started_at:
        started_time = datetime.fromisoformat(verification_started_at.replace('Z', '+00:00'))
    elif updated_at:
        started_time = updated_at if isinstance(updated_at, datetime) else datetime.fromisoformat(str(updated_at))
    else:
        started_time = datetime.utcnow()
    
    time_in_verifying = datetime.utcnow() - started_time.replace(tzinfo=None)
    
    logger.info(f"Task ID: {task_id}")
    logger.info(f"Time in VERIFYING: {time_in_verifying}")
    
    if not task_id:
        if time_in_verifying < timedelta(minutes=5):
            logger.info("No task ID found, but recently set (<5 min)")
            logger.info("Expected resolution: Waiting for task ID to appear")
            logger.info("                     Will check again on next run")
            return 'verification_spawned'
        else:
            logger.warning("="*80)
            logger.warning("FAILURE MODE: STALE VERIFYING STATUS (NO TASK ID)")
            logger.warning(f"Dataset ID: {dataset_id}")
            logger.warning(f"Dataset name: {dataset_name}")
            logger.warning(f"Time in VERIFYING: {time_in_verifying}")
            logger.warning("Cause: Script likely crashed after setting VERIFYING but before spawning task")
            logger.warning("Expected resolution: Will spawn new verification task")
            logger.warning("="*80)
            
            if dry_run:
                logger.info("[DRY RUN] Would respawn verification task")
                return 'verification_spawned'
            
            return handle_uploaded_status(dataset_id, dataset_name, upload_log, metadata, dry_run, verify_task)
    
    # 4 hours is a safe upper bound: BLAKE3 hashing 100 GB across tens of
    # thousands of small files on a research HPC filesystem peaks at roughly
    # 45–90 minutes.  4 hours gives 2–4× headroom while cutting the previous
    # 24-hour dead-man window by 6×, reducing the time a lost Celery message
    # keeps the upload stuck in a spinning "Verifying…" state.
    VERIFICATION_TIMEOUT = timedelta(hours=4)

    if time_in_verifying > VERIFICATION_TIMEOUT:
        timeout_hours = int(VERIFICATION_TIMEOUT.total_seconds() // 3600)
        logger.error("="*80)
        logger.error(f"FAILURE MODE: VERIFICATION TIMEOUT (>{timeout_hours} HOURS)")
        logger.error(f"Dataset ID: {dataset_id}")
        logger.error(f"Dataset name: {dataset_name}")
        logger.error(f"Task ID: {task_id}")
        logger.error(f"Time in VERIFYING: {time_in_verifying}")
        logger.error(f"Cause: Task exceeded {timeout_hours}-hour hard limit or Celery message was lost")
        logger.error("Expected resolution: Mark as VERIFICATION_FAILED")
        logger.error("                     Admin will be notified")
        logger.error("                     Admin should check Celery logs for task")
        logger.error("="*80)
        
        if not dry_run:
            api.update_dataset_upload_log(
                dataset_id=dataset_id,
                log_data={
                    'status': UPLOAD_STATUS['VERIFICATION_FAILED'],
                    'metadata': {
                        **metadata,
                        'failure_reason': f'Verification timeout (>{timeout_hours} hours). Task ID: {task_id}',
                        'failed_at': datetime.utcnow().isoformat(),
                    }
                }
            )
        return 'verification_failed'
    
    try:
        task_result = celery_app.AsyncResult(task_id)
        task_state = task_result.state
        
        logger.info(f"Celery task state: {task_state}")
        
        if task_state == 'SUCCESS':
            logger.info("="*80)
            logger.info("RECOVERY MODE: TASK SUCCEEDED BUT STATUS NOT UPDATED")
            logger.info(f"Dataset ID: {dataset_id}")
            logger.info(f"Dataset name: {dataset_name}")
            logger.info(f"Task ID: {task_id}")
            logger.info("Cause: Task completed but crashed before updating status to VERIFIED")
            logger.info("Expected resolution: Script will update status to VERIFIED now")
            logger.info("                     Next run will trigger workflow")
            logger.info("="*80)
            
            if not dry_run:
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={'status': UPLOAD_STATUS['VERIFIED']}
                )
                logger.info("✓ Status updated to VERIFIED")
            
            return 'verified_triggered'
            
        elif task_state in ['PENDING', 'STARTED']:
            logger.info(f"Verification task still running (state: {task_state})")
            logger.info("Expected resolution: Wait for task to complete")
            logger.info("                     Check again on next script run")
            return 'verification_spawned'
            
        elif task_state == 'FAILURE':
            task_info = task_result.info
            logger.error("="*80)
            logger.error("FAILURE MODE: VERIFICATION TASK FAILED")
            logger.error(f"Dataset ID: {dataset_id}")
            logger.error(f"Dataset name: {dataset_name}")
            logger.error(f"Task ID: {task_id}")
            logger.error(f"Task info: {task_info}")
            logger.error("Cause: Celery task failed (exception thrown)")
            logger.error("Note: This ALSO covers 'worker crash mid-hash' case:")
            logger.error("      If entire worker system goes down, Celery marks task as FAILURE")
            logger.error("      when system comes back up (worker didn't heartbeat)")
            logger.error("Expected resolution: Task should have already set status to VERIFICATION_FAILED")
            logger.error("                     Applying fallback DB update if status is still VERIFYING")
            logger.error("="*80)

            if not dry_run:
                # The subprocess normally writes VERIFICATION_FAILED itself before exiting.
                # If the API was unreachable at that moment, the status stays VERIFYING
                # indefinitely.  Re-fetch and apply a fallback write as a safety net.
                current_upload_log = api.get_dataset_upload_log(dataset_id)
                if current_upload_log.get('status') == UPLOAD_STATUS['VERIFYING']:
                    logger.warning(f"Status still VERIFYING after task FAILURE — applying fallback VERIFICATION_FAILED")
                    api.update_dataset_upload_log(
                        dataset_id=dataset_id,
                        log_data={
                            'status': UPLOAD_STATUS['VERIFICATION_FAILED'],
                            'metadata': {
                                **metadata,
                                'failure_reason': (
                                    f'Verification task entered FAILURE state in Celery (task ID: {task_id}). '
                                    f'Status was still VERIFYING — fallback applied by upload manager.'
                                ),
                                'failed_at': datetime.utcnow().isoformat(),
                            }
                        }
                    )
                    logger.warning("✓ Fallback VERIFICATION_FAILED status written")
                else:
                    logger.info(f"Status is already {current_upload_log.get('status')} — no fallback needed")

            return 'verification_failed'
            
        elif task_state == 'RETRY':
            logger.info(f"Verification task is retrying")
            logger.info("Expected resolution: Celery will retry task automatically")
            logger.info("                     Check again on next script run")
            return 'verification_spawned'
            
        else:
            logger.warning("="*80)
            logger.warning(f"FAILURE MODE: UNEXPECTED TASK STATE: {task_state}")
            logger.warning(f"Dataset ID: {dataset_id}")
            logger.warning(f"Dataset name: {dataset_name}")
            logger.warning(f"Task ID: {task_id}")
            logger.warning("Cause: Task in unexpected state")
            logger.warning("Expected resolution: Mark as VERIFICATION_FAILED")
            logger.warning("                     Admin should investigate Celery task logs")
            logger.warning("="*80)
            
            if not dry_run:
                api.update_dataset_upload_log(
                    dataset_id=dataset_id,
                    log_data={
                        'status': UPLOAD_STATUS['VERIFICATION_FAILED'],
                        'metadata': {
                            **metadata,
                            'failure_reason': f'Unexpected task state: {task_state}. Task ID: {task_id}',
                            'failed_at': datetime.utcnow().isoformat(),
                        }
                    }
                )
            return 'verification_failed'
            
    except Exception as e:
        logger.error("="*80)
        logger.error("FAILURE MODE: FAILED TO CHECK CELERY TASK STATE")
        logger.error(f"Dataset ID: {dataset_id}")
        logger.error(f"Dataset name: {dataset_name}")
        logger.error(f"Task ID: {task_id}")
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error("Possible causes:")
        logger.error("  - Celery broker (RabbitMQ) unreachable")
        logger.error("  - Task ID invalid or expired")
        logger.error("Expected resolution: Will retry check on next script run")
        logger.error("                     If persists >4h, will be caught by timeout handler")
        logger.error("="*80)
        return 'errors'


def handle_verified_status(dataset_id, dataset_name, dataset, dry_run):
    """
    Handle upload with VERIFIED status - trigger integrated workflow.
    
    Returns:
        str: Result key for summary
    """
    logger.info("Action: Trigger integrated workflow")
    
    active_integrated_wfs = [wf for wf in dataset.get('workflows', [])
                             if wf['name'] == WORKFLOWS['INTEGRATED']]
    if active_integrated_wfs:
        # A workflow row already exists in Postgres.  Since start() is called
        # before the API write, the Celery chain was already enqueued on a
        # previous run.  The only reason we are back here with VERIFIED status
        # is that the COMPLETE status write failed on that run.  Retry the
        # write now — no new workflow is created, preventing double-launch.
        logger.info("Workflow row already exists (COMPLETE status write likely failed on a previous run)")
        if not dry_run:
            logger.info("Retrying COMPLETE status update...")
            api.update_dataset_upload_log(
                dataset_id=dataset_id,
                log_data={'status': UPLOAD_STATUS['COMPLETE']}
            )
            logger.info("✓ Status updated to COMPLETE")
        else:
            logger.info("[DRY RUN] Would retry COMPLETE status update")
        return 'verified_triggered'

    if dry_run:
        logger.info("[DRY RUN] Would trigger integrated workflow")
        return 'verified_triggered'

    try:
        logger.info(f"Starting {WORKFLOWS['INTEGRATED']} workflow...")
        integrated_wf_body = wf_utils.get_wf_body(wf_name=WORKFLOWS['INTEGRATED'])
        int_wf = Workflow(celery_app=celery_app, **integrated_wf_body)
        int_wf_id = int_wf.workflow['_id']

        # ORDERING: start() is called before the API write so that if start()
        # fails, no Postgres workflow row is written.  Without that row the
        # guard above won't fire, letting the next cron run retry from scratch.
        int_wf.start(dataset_id)
        logger.info(f"✓ Workflow Celery chain enqueued: {int_wf_id}")

        # Pass workflow_id to update_dataset_upload_log so the API associates
        # the workflow row AND updates the status to COMPLETE in one DB
        # transaction — eliminating the gap where workflow row exists but status
        # is still VERIFIED (or vice-versa).
        logger.info("Registering workflow row and updating status to COMPLETE (atomic)...")
        api.update_dataset_upload_log(
            dataset_id=dataset_id,
            log_data={'status': UPLOAD_STATUS['COMPLETE']},
            workflow_id=int_wf_id,
        )
        logger.info("✓ Workflow row registered and status updated to COMPLETE")
        logger.info("Expected resolution: Workflow will process upload")
        logger.info("                     Monitor via /workflows page")

        return 'verified_triggered'

    except Exception as e:
        logger.error("="*80)
        logger.error("FAILURE MODE: FAILED TO TRIGGER WORKFLOW")
        logger.error(f"Dataset ID: {dataset_id}")
        logger.error(f"Dataset name: {dataset_name}")
        logger.error(f"Error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error("Possible causes:")
        logger.error("  - Rhythm API unreachable")
        logger.error("  - MongoDB unreachable")
        logger.error("  - Celery broker issue")
        logger.error("Expected resolution: Upload remains in VERIFIED status")
        logger.error("                     Will retry on next script run")
        logger.error("="*80)
        return 'errors'


def process_failed_uploads(dry_run=False, max_retries=MAX_RETRY_COUNT):
    """
    Process uploads that are PROCESSING_FAILED and eligible for retry.
    
    Retries uploads that haven't exceeded max retry count.
    Marks uploads as PERMANENTLY_FAILED after max retries and sends admin notification.
    
    Args:
        dry_run (bool): If True, simulates without making changes
        max_retries (int): Maximum retry attempts before permanent failure
    
    Returns:
        dict: Summary of failed uploads processed
    """
    logger.info("\n--- Processing Failed Uploads ---")
    
    summary = {'retried': 0, 'permanently_failed': 0, 'errors': 0}
    
    try:
        response = api.get_failed_uploads(max_retry_count=max_retries - 1)
        failed_uploads = response.get('uploads', [])
        
        logger.info(f"Found {len(failed_uploads)} failed uploads eligible for processing")
        
        for upload in failed_uploads:
            dataset_id = upload['dataset_id']
            dataset_name = upload['dataset_name']
            retry_count = upload.get('retry_count', 0)
            last_error = upload.get('last_error', 'Unknown error')
            
            logger.info(f"\nFailed upload:")
            logger.info(f"  Dataset ID: {dataset_id}")
            logger.info(f"  Dataset Name: {dataset_name}")
            logger.info(f"  Retry Count: {retry_count}/{max_retries}")
            logger.info(f"  Last Error: {last_error}")
            
            if retry_count < max_retries:
                new_retry_count = retry_count + 1
                logger.info(f"  Retry attempt {new_retry_count}/{max_retries}")
                
                try:
                    if dry_run:
                        logger.info(f"  [DRY RUN] Would retry workflow for dataset {dataset_id}")
                        logger.info(f"  [DRY RUN] Would update retry_count to {new_retry_count}")
                    else:
                        dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)

                        active_integrated_wfs = [wf for wf in dataset.get('workflows', [])
                                                 if wf['name'] == WORKFLOWS['INTEGRATED']]
                        if active_integrated_wfs:
                            # Workflow row exists — start() was called on a previous run.
                            # The Celery chain is already enqueued; only the COMPLETE
                            # status write failed.  Retry it now (same logic as
                            # handle_verified_status) rather than launching a second chain.
                            logger.info(f"  Workflow row already exists (COMPLETE write likely failed) — retrying status update")
                            api.update_dataset_upload_log(
                                dataset_id=dataset_id,
                                log_data={
                                    'status': UPLOAD_STATUS['COMPLETE'],
                                    'retry_count': new_retry_count,
                                }
                            )
                            logger.info(f"  ✓ Status updated to COMPLETE")
                            summary['retried'] += 1
                            continue

                        logger.info(f"  Starting {WORKFLOWS['INTEGRATED']} workflow (retry {new_retry_count})...")
                        integrated_wf_body = wf_utils.get_wf_body(wf_name=WORKFLOWS['INTEGRATED'])
                        int_wf = Workflow(celery_app=celery_app, **integrated_wf_body)
                        int_wf_id = int_wf.workflow['_id']

                        # start() before the API write — same rationale as
                        # handle_verified_status: if start() fails, no Postgres
                        # row is written, so the guard above won't block the
                        # next retry attempt.
                        int_wf.start(dataset_id)
                        logger.info(f"  ✓ Workflow Celery chain enqueued: {int_wf_id}")

                        # Pass workflow_id so the API associates the workflow
                        # row AND updates COMPLETE + retry_count atomically in
                        # one DB transaction.
                        api.update_dataset_upload_log(
                            dataset_id=dataset_id,
                            log_data={
                                'status': UPLOAD_STATUS['COMPLETE'],
                                'retry_count': new_retry_count,
                            },
                            workflow_id=int_wf_id,
                        )
                        logger.info(f"  ✓ Workflow row registered and status updated to COMPLETE (retry_count={new_retry_count})")
                        summary['retried'] += 1
                        
                except Exception as e:
                    logger.error(f"  ✗ Failed to retry workflow for dataset {dataset_id}: {e}")
                    summary['errors'] += 1
            else:
                logger.info(f"  Max retries ({max_retries}) exceeded - marking as PERMANENTLY_FAILED")
                
                try:
                    if dry_run:
                        logger.info(f"  [DRY RUN] Would mark dataset {dataset_id} as PERMANENTLY_FAILED")
                        logger.info(f"  [DRY RUN] Would send admin notification")
                    else:
                        api.update_dataset_upload_log(
                            dataset_id=dataset_id,
                            log_data={
                                'status': UPLOAD_STATUS['PERMANENTLY_FAILED'],
                                'metadata': {
                                    'failure_reason': f"Failed after {max_retries} retry attempts. Last error: {last_error}",
                                },
                            }
                        )
                        
                        send_permanent_failure_notification(
                            dataset_id=dataset_id,
                            dataset_name=dataset_name,
                            retry_count=retry_count,
                            last_error=last_error,
                        )
                        
                        logger.info(f"  ✓ Marked as permanently failed and notified admins")
                        summary['permanently_failed'] += 1
                        
                except Exception as e:
                    logger.error(f"  ✗ Failed to mark dataset {dataset_id} as permanently failed: {e}")
                    summary['errors'] += 1
    
    except Exception as e:
        logger.error(f"Failed to fetch failed uploads: {e}", exc_info=True)
        summary['errors'] += 1
    
    logger.info(f"\nFailed uploads processed: {summary['retried']} retried, "
                f"{summary['permanently_failed']} permanently failed, {summary['errors']} errors")
    return summary


def send_permanent_failure_notification(dataset_id, dataset_name, retry_count, last_error):
    """
    Send admin notification for permanently failed upload.

    No-ops when config.enabled_features.notifications is False.

    Args:
        dataset_id (int): Dataset ID
        dataset_name (str): Dataset name
        retry_count (int): Number of retry attempts made
        last_error (str): Last error message
    """
    if not config.get('enabled_features', {}).get('notifications', False):
        logger.info(f"  Notifications disabled — skipping admin notification for dataset {dataset_id}")
        return

    try:
        notification_payload = {
            'title': f'Upload Permanently Failed: {dataset_name}',
            'message': (
                f'Dataset upload has permanently failed after {retry_count} retry attempts.\n\n'
                f'Dataset ID: {dataset_id}\n'
                f'Dataset Name: {dataset_name}\n'
                f'Retry Count: {retry_count}\n'
                f'Last Error: {last_error}\n\n'
                f'Manual intervention required.'
            ),
            'type': 'error',
            'metadata': {
                'dataset_id': dataset_id,
                'dataset_name': dataset_name,
                'retry_count': retry_count,
                'error': last_error,
                'timestamp': datetime.utcnow().isoformat(),
            },
        }

        api.create_notification(notification_payload)
        logger.info(f"  ✓ Admin notification sent for dataset {dataset_id}")

    except Exception as e:
        logger.error(f"  ✗ Failed to send notification for dataset {dataset_id}: {e}")


if __name__ == "__main__":
    fire.Fire(manage_upload_workflows)
