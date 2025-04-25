import logging
from datetime import datetime

from workers.celery_app import app as celery_app
from workers import api
from workers.config import config
from workers.constants.upload import *
from workers.constants.workflow import WORKFLOWS, WORKFLOW_FINISHED_STATUSES
import workers.workflow_utils as wf_utils
from sca_rhythm import Workflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# todo - send notification to admin for when a dataset has been PROCESSING for >= 72 hours,
# todo - send notification to admin for uploads whose state hasn't changed to UPLOADED to
#   PROCESSING for more than 72 hours

def main():
    past_dataset_uploads = api.get_dataset_upload_logs()
    dataset_upload_logs = past_dataset_uploads['uploads']

    logger.info(f"Found {len(dataset_upload_logs)} dataset uploads")

    dataset_uploads_pending_processing = [
        dataset_upload_log for dataset_upload_log in dataset_upload_logs if (
                dataset_upload_log['status'] == config['upload']['status']['PROCESSING_FAILED'] or
                dataset_upload_log['status'] == config['upload']['status']['UPLOADED']
        )]

    logger.info(f"Found {len(dataset_uploads_pending_processing)} dataset uploads that "
                f" are currently pending processing, with an upload status of UPLOADED "
                f"or PROCESSING_FAILED")

    for dataset_upload_log in dataset_uploads_pending_processing:
        upload_status = dataset_upload_log['status']
        dataset_upload_log_id = dataset_upload_log['id']
        dataset_upload_audit_log = dataset_upload_log['audit_log']
        dataset_id = dataset_upload_audit_log['dataset_id']

        logger.info(f"Processing dataset upload {dataset_upload_log_id} (dataset_id {dataset_id})")
        logger.info(f"Upload status: {upload_status}")

        upload_last_updated_time = datetime.fromisoformat(dataset_upload_log['updated_at'][:-1])
        current_time = datetime.now()
        difference = (current_time - upload_last_updated_time).total_seconds() / 3600
        logger.info(f"Dataset upload {dataset_upload_log_id} was last updated {difference} hours ago")

        # Retry processing an upload if:
        # - the upload status is UPLOADED or
        # - the upload status is PROCESSING_FAILED and the upload has been not been updated for more than 72 hours
        will_resume_workflow = (
                upload_status == config['upload']['status']['UPLOADED'] or
                (
                        upload_status == config['upload']['status']['PROCESSING_FAILED'] and
                        difference > UPLOAD_RETRY_THRESHOLD_HOURS
                )
        )
        if will_resume_workflow:
            logger.info(f"Will retry running workflow {WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW']} for "
                        f"dataset upload {dataset_upload_log_id} (dataset_id: {dataset_id})")
            restart_process_dataset_upload_workflow(dataset_upload_log=dataset_upload_log)


def restart_process_dataset_upload_workflow(dataset_upload_log: dict) -> None:
    dataset_upload_log_id = dataset_upload_log['id']
    dataset_id = dataset_upload_log['dataset_id']

    dataset = api.get_dataset(dataset_id=dataset_id, workflows=True)

    logger.info(f"Checking for active workflows of type"
                f" {WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW']} running for dataset {dataset_id}")
    active_process_dataset_upload_wfs = [
        wf for wf in dataset['workflows'] if (
                wf['name'] == WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW'] and
                wf['status'] not in WORKFLOW_FINISHED_STATUSES
        )
    ]

    if len(active_process_dataset_upload_wfs) > 0:
        logger.info(f"The following workflows of type {WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW']} "
                    f"are currently running for dataset {dataset_id} "
                    f"(dataset_upload_log id: {dataset_upload_log_id}):")
        active_process_dataset_upload_wf_ids = [wf['id'] for wf in active_process_dataset_upload_wfs]
        logger.info(active_process_dataset_upload_wf_ids)
        logger.info(f"A new workflow will not be started.")
    else:
        logger.info(f"No active workflows of type {WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW']} found running "
                    f"for dataset {dataset_id}")
        logger.info(f"Starting workflow {WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW']} for dataset {dataset_id}")
        wf_body = wf_utils.get_wf_body(wf_name=WORKFLOWS['PROCESS_DATASET_UPLOAD_WORKFLOW'])
        wf = Workflow(celery_app=celery_app, **wf_body)
        wf_id = wf.workflow['_id']
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf_id)
        wf.start(dataset_id)
        logger.info(f"Started workflow {wf_id} for dataset {dataset_id}")


if __name__ == "__main__":
    main()
