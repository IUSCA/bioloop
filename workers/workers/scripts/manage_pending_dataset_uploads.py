import logging
from datetime import datetime
import fire
from sca_rhythm import Workflow

from workers.celery_app import app as celery_app
from workers import api
from workers.constants.upload import *
from workers.constants.workflow import WORKFLOWS, WORKFLOW_FINISHED_STATUSES
from workers.constants.upload import UPLOAD_STATUS
import workers.workflow_utils as wf_utils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# todo - send notification to admin for when a dataset has been PROCESSING for >= 72 hours,
# todo - send notification to admin for uploads whose state hasn't changed to UPLOADED to
#   PROCESSING for more than 72 hours
# todo - only retrieve uploads whose status is not COMPLETE

def manage_pending_uploads(dry_run=True):
    """
    Manage pending dataset uploads by processing the ones that are in `UPLOADED` or `PROCESSING_FAILED` status.

    This function retrieves all past dataset uploads, identifies those pending processing,
    and initiates or restarts the upload processing workflow for eligible uploads.

    Args:
        dry_run (bool): If True, simulates the process without making actual changes.

    Returns:
        None
    """
    past_dataset_uploads = api.get_dataset_uploads()
    dataset_upload_logs = past_dataset_uploads['uploads']

    logger.info(f"Found {len(dataset_upload_logs)} dataset uploads")

    dataset_uploads_pending_processing = [
        dataset_upload_log for dataset_upload_log in dataset_upload_logs if (
                dataset_upload_log['status'] == UPLOAD_STATUS['PROCESSING_FAILED'] or
                dataset_upload_log['status'] == UPLOAD_STATUS['UPLOADED']
        )]

    logger.info(f"Found {len(dataset_uploads_pending_processing)} dataset uploads that "
                f"are currently pending processing, with an upload status of `UPLOADED` "
                f"or `PROCESSING_FAILED`.")

    for dataset_upload_log in dataset_uploads_pending_processing:
        upload_status = dataset_upload_log['status']
        dataset_upload_log_id = dataset_upload_log['id']
        dataset_id = dataset_upload_log['create_log']['dataset']['id']

        logger.info(f"Processing dataset upload {dataset_upload_log_id} (dataset_id {dataset_id})")
        logger.info(f"Upload status: {upload_status}")

        upload_last_updated_time = datetime.fromisoformat(dataset_upload_log['updated_at'][:-1])
        current_time = datetime.now()
        difference = (current_time - upload_last_updated_time).total_seconds() / 3600
        logger.info(f"Dataset upload {dataset_upload_log_id} was last updated {difference} hours ago")

        # Retry processing an upload if:
        # - the upload status is `UPLOADED` or `PROCESSING_FAILED` and the upload has been not been
        # updated for more than 72 hours
        will_resume_workflow = (
                (upload_status == UPLOAD_STATUS['UPLOADED'] or upload_status == UPLOAD_STATUS['PROCESSING_FAILED'])
                and
                difference > UPLOAD_RETRY_THRESHOLD_HOURS
        )
        if will_resume_workflow:
            logger.info(f"Will retry running workflow {WORKFLOWS['PROCESS_DATASET_UPLOAD']} for "
                        f"dataset upload {dataset_upload_log_id} (dataset_id: {dataset_id})")
            restart_process_dataset_upload_workflow(dataset_id=dataset_id, dry_run=dry_run)


def restart_process_dataset_upload_workflow(dataset_id: str, dry_run: bool = True) -> None:
    """
    Restart the `process_dataset_upload` workflow for a given dataset.

    This function checks for active workflows on the dataset and starts a new
    `process_dataset_upload` workflow if no conflicting workflows are running.

    Args:
        dataset_id (str): The ID of the dataset to process.
        dry_run (bool): If True, simulates the process without making actual changes.

    Returns:
        None
        :param dataset_id:
        :param dry_run:
    """
    dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)

    logger.info(f"Checking for active workflows of type "
                f"{WORKFLOWS['PROCESS_DATASET_UPLOAD']} or {WORKFLOWS['CANCEL_DATASET_UPLOAD']} "
                f"running on dataset {dataset_id}")
    active_process_dataset_upload_wfs = [
        wf for wf in dataset['workflows'] if (
                (
                        wf['name'] == WORKFLOWS['PROCESS_DATASET_UPLOAD'] or
                        wf['name'] == WORKFLOWS['CANCEL_DATASET_UPLOAD']
                ) and
                wf['status'] not in WORKFLOW_FINISHED_STATUSES
        )
    ]

    # - If workflow `process_dataset_upload` has been initiated, do nothing.
    #     - For workflows of this type that are stuck or failing, admin or operators
    #       are expected to investigate and manually resume this workflow from the portal.
    # - If workflow `cancel_dataset_upload` is running, workflow `process_dataset_upload`
    #   should not be restarted.
    if len(active_process_dataset_upload_wfs) > 0:
        logger.info(f"The following upload workflows "
                    f"are currently running for dataset {dataset_id}:")
        for wf in active_process_dataset_upload_wfs:
            logger.info(f"Workflow ID: {wf['id']}")
            logger.info(f"Workflow name: {wf['name']}")
        logger.info(f"A new workflow will not be started.")
    else:
        logger.info(f"No workflows of type {WORKFLOWS['PROCESS_DATASET_UPLOAD']} or "
                    f"{WORKFLOWS['CANCEL_DATASET_UPLOAD']} are running "
                    f"on dataset {dataset_id}")
        if dry_run:
            logger.info("Dry run mode enabled.")
            logger.info(f"Would have started workflow {WORKFLOWS['PROCESS_DATASET_UPLOAD']} for dataset {dataset_id}")
        else:
            logger.info(f"Starting workflow {WORKFLOWS['PROCESS_DATASET_UPLOAD']} for dataset {dataset_id}")
            wf_body = wf_utils.get_wf_body(wf_name=WORKFLOWS['PROCESS_DATASET_UPLOAD'])
            wf = Workflow(celery_app=celery_app, **wf_body)
            wf_id = wf.workflow['_id']
            api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf_id)
            wf.start(dataset_id)
            logger.info(f"Started workflow {wf_id} for dataset {dataset_id}")


"""
This script manages pending dataset uploads by processing those in `UPLOADED` or `PROCESSING_FAILED` status.

What it does:
1. Retrieves all past dataset uploads.
2. Identifies uploads pending processing (status: `UPLOADED` or `PROCESSING_FAILED`).
3. For each pending upload:
   a. Checks if it's eligible for processing based on its status and last update time.
   b. Attempts to restart the process_dataset_upload workflow if eligible.
4. When restarting a workflow:
   a. Checks for any active conflicting workflows.
   b. If no conflicts, starts a new `process_dataset_upload` workflow.

Usage:
python -m workers.scripts.manage_pending_dataset_uploads [OPTIONS]

Options:
--dry-run: If set to True (default), the script simulates the process without making
           any actual changes. Set to False to perform actual workflow restarts.

Example usage:
1. Dry run (simulate without changes):
   python -m workers.scripts.manage_pending_dataset_uploads

2. Actually process and restart workflows:
   python -m workers.scripts.manage_pending_dataset_uploads --dry-run=False
"""
if __name__ == "__main__":
    fire.Fire(manage_pending_uploads)
