import logging
import shutil
from datetime import datetime
from pathlib import Path

from workers.celery_app import app as celery_app
from workers import api
from workers.config import config
import workers.workflow_utils as wf_utils
from sca_rhythm import Workflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROCESS_DATASET_UPLOAD_WORKFLOW = 'process_dataset_upload'
DONE_STATUSES = [config['DONE_STATUSES']['REVOKED'],
                 config['DONE_STATUSES']['FAILURE'],
                 config['DONE_STATUSES']['SUCCESS']]

UPLOAD_RETRY_THRESHOLD_HOURS = config['upload']['UPLOAD_RETRY_THRESHOLD_HOURS']


# todo - send notification to admin for when a dataset has been PROCESSING for >= 72 hours,
# todo - send notification to admin for uploads whose state hasn't changed to UPLOADED to
#   PROCESSING for more than 72 hours

def main():
    past_dataset_uploads = api.get_dataset_upload_logs()
    dataset_uploads = past_dataset_uploads['uploads']

    logger.info(f"Processing {len(dataset_uploads)} dataset uploads")

    dataset_uploads_failing_processing = [
        upload for upload in dataset_uploads if (
                upload['upload_log']['status'] == config['upload']['status']['PROCESSING_FAILED']
        )]

    logger.info(f"Processing {len(dataset_uploads_failing_processing)} dataset uploads that failed processing")

    for ds_upload in dataset_uploads_failing_processing:
        dataset_id = ds_upload['dataset_id']
        upload_log = ds_upload['upload_log']

        logger.info(f"Processing upload {upload_log['id']} for dataset_id: {dataset_id}")

        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)

        upload_last_updated_time = datetime.fromisoformat(upload_log['last_updated'][:-1])
        current_time = datetime.now()
        difference = (current_time - upload_last_updated_time).total_seconds() / 3600

        # retry processing this upload if it hasn't been updated in the last 72 hours
        if difference <= UPLOAD_RETRY_THRESHOLD_HOURS:
            logger.info(f'Upload {upload_log["id"]} has been in state {upload_log["status"]} for {difference} hours.'
                        f' Retrying processing of upload.')
            active_process_dataset_upload_wfs = [wf for wf in dataset['workflows'] if wf['name'] ==
                                                 PROCESS_DATASET_UPLOAD_WORKFLOW]
            if len(active_process_dataset_upload_wfs) > 0:
                logger.info(f"Workflow {PROCESS_DATASET_UPLOAD_WORKFLOW} is already running for dataset {dataset_id}"
                      f" (upload_log_id: {upload_log['id']})")
            else:
                # retry processing this upload
                logger.info(f'Beginning workflow {PROCESS_DATASET_UPLOAD_WORKFLOW} for dataset {dataset_id}')
                wf_body = wf_utils.get_wf_body(wf_name=PROCESS_DATASET_UPLOAD_WORKFLOW)
                wf = Workflow(celery_app=celery_app, **wf_body)
                api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
                wf.start(dataset_id)
        else:
            # mark dataset uploads which could not be processed as FAILED and clean up their resources
            logger.info(
                f"Upload id {upload_log['id']} has been in status {upload_log['status']} for {difference} hours,"
                f" which exceeds the threshold of ${UPLOAD_RETRY_THRESHOLD_HOURS} hours.")
            logger.info(f"Marking upload {upload_log['id']} as {config['upload']['status']['FAILED']}.")

            uploaded_dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset_id)

            logger.info(f"Deleting upload {upload_log['id']}'s uploaded resources and processed artifacts from"
                        f" {str(uploaded_dataset_path)}")
            if uploaded_dataset_path.exists():
                shutil.rmtree(uploaded_dataset_path)
            logger.info(f"Deleted dataset directory {uploaded_dataset_path}")

            file_updates = [
                {
                    'id': file['id'],
                    'data': {
                        'status': config['upload']['status']['FAILED']
                    }
                }
                for file in upload_log['files']
            ]
            api.update_dataset_upload_log(
                uploaded_dataset_id=dataset_id,
                log_data={
                    'status': config['upload']['status']['FAILED'],
                    'files': file_updates
                }
            )


if __name__ == "__main__":
    main()
