import logging
import shutil
from pathlib import Path
import hashlib
from datetime import datetime
# from celery import current_app

from workers.celery_app import app as celery_app
from workers import api
from workers.config import config
import workers.utils as utils
import workers.workflow_utils as wf_utils
from sca_rhythm import WorkflowTask, Workflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    # print("CALLING PENDING RESUME SCRIPT")

    uploads = api.get_upload_logs()
    pending_uploads = [
        upload for upload in uploads if (
                upload['status'] != 'COMPLETE' and upload['status'] != 'FAILED'
        )]

    print(f'pending_uploads : {len(pending_uploads)}')
    for upload in pending_uploads:
        # print(f'upload: {upload}')
        # print(f'upload["last_updated"]: {upload["last_updated"]}')
        last_updated_time = datetime.fromisoformat(upload['last_updated'][:-1])
        # print('last_updated_time')
        # print(str(last_updated_time))
        current_time = datetime.now()
        # print('current_time')
        # print(str(current_time))

        dataset_id = upload['dataset_id']
        difference = (current_time - last_updated_time).total_seconds() / 3600
        print(difference)

        if difference <= 24:
            # retry processing this upload
            print(f"Retrying to process upload {upload['id']}")
            print("Beginning 'process_uploads' workflow")
            # todo - check if this workflow isn't already running
            wf_body = wf_utils.get_wf_body(wf_name='process_uploads')
            wf = Workflow(celery_app=celery_app, **wf_body)
            api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=wf.workflow['_id'])
            wf.start(upload['id'])
        else:
            # mark upload as failed and clean up resources
            print(
                f"Upload id {upload['id']} has been in state PROCESSING for more than 24 hours, and will be cleaned up")
            try:
                shutil.rmtree(upload['dataset']['origin_path'])
                # todo - mark status of files as FAILED too
                api.update_upload_log(upload['id'], {
                    'status': 'FAILED'
                })
            except Exception as e:
                print(f"Encountered exception processing upload log with id {upload['id']}")
                print(e)


if __name__ == "__main__":
    main()
