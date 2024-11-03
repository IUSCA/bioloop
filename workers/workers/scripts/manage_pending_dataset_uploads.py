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

WORKFLOW_NAME = 'process_dataset_upload'
DONE_STATUSES = [config['DONE_STATUSES']['REVOKED'],
                 config['DONE_STATUSES']['FAILURE'],
                 config['DONE_STATUSES']['SUCCESS']]

UPLOAD_RETRY_THRESHOLD_HOURS = config['upload']['UPLOAD_RETRY_THRESHOLD_HOURS']

def main():
    uploads = api.get_upload_logs(upload_type='DATASET')
    pending_uploads = [
        upload for upload in uploads if (
                upload['status'] == config['upload']['status']['UPLOADED'] or
                upload['status'] == config['upload']['status']['PROCESSING']
        )]

    for upload in pending_uploads:
        print(f"Processing upload {upload['id']}")

        last_updated_time = datetime.fromisoformat(upload['last_updated'][:-1])
        current_time = datetime.now()
        difference = (current_time - last_updated_time).total_seconds() / 3600

        # retry processing this upload if it hasn't been updated in the last 72 hours
        if difference <= UPLOAD_RETRY_THRESHOLD_HOURS:
            print(f'Upload {upload["id"]} has been in state {upload["status"]} for {UPLOAD_RETRY_THRESHOLD_HOURS} hours.'
                  f' Retrying processing of upload')
            # retry processing this upload
            dataset_id = upload['dataset_upload_log']['dataset_id']
            dataset = api.get_dataset(dataset_id, workflows=True)
            duplicate_workflows = [
                wf for wf in dataset['workflows']
                # Todo - wf['name'] won't work
                if wf['name'] == WORKFLOW_NAME and
                   wf['status'] not in DONE_STATUSES
            ]
            if len(duplicate_workflows) == 0:
                print(f'Beginning workflow {WORKFLOW_NAME} for dataset {dataset_id}')
                wf_body = wf_utils.get_wf_body(wf_name=WORKFLOW_NAME)
                wf = Workflow(celery_app=celery_app, **wf_body)
                api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
                wf.start(dataset_id)
            else:
                print(f'Found active workflow {WORKFLOW_NAME} for dataset {dataset_id}')
        else:
            # mark upload as failed and clean up resources
            print(
                f"Upload id {upload['id']} has been in a pending state for more than"
                f" ${UPLOAD_RETRY_THRESHOLD_HOURS} hours, and will be cleaned up")
            origin_path = Path(upload['dataset']['origin_path'])
            # todo - delete uploaded chunks as well
            if origin_path.exists():
                shutil.rmtree(origin_path)
            file_updates = [
                {
                    'id': file['id'],
                    'data': {
                        'status': config['upload']['status']['FAILED']
                    }
                }
                for file in upload['files']
            ]
            api.update_upload_log(upload['id'], {
                'status': config['upload']['status']['FAILED'],
                'files': file_updates
            })


if __name__ == "__main__":
    main()
