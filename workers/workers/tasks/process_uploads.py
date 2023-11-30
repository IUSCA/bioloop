import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow

import workers.utils as utils
from workers import exceptions as exc
import workers.api as api
from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

DONE_STATUSES = [config['DONE_STATUSES']['REVOKED'],
                 config['DONE_STATUSES']['FAILURE'],
                 config['DONE_STATUSES']['SUCCESS']]


def merge_file_chunks(file_name, file_md5, chunks_path, destination_path, num_chunks_expected):
    print(f'Processing file {file_name}')
    checksum_error = False

    if destination_path.exists():
        print(f"Destination path {destination_path} exists and will be deleted")
        destination_path.unlink()

    num_chunk_found = len([p for p in chunks_path.iterdir()])
    if num_chunk_found != num_chunks_expected:
        print('Expected number of chunks don\'t equal number of chunks found. This file\'s'
              ' chunks will not be merged')
        checksum_error = True

    if not checksum_error:
        for i in range(num_chunk_found):
            chunk_file = chunks_path / f'{file_md5}-{i}'
            print(f'Processing chunk {chunk_file}')
            with open(chunk_file, 'rb') as chunk:
                with open(destination_path, 'ab') as destination:
                    destination.write(chunk.read())

        evaluated_checksum = utils.checksum(destination_path)
        print(f'evaluated_checksum: {evaluated_checksum}')
        checksum_error = evaluated_checksum != file_md5

    return config['upload_status']['VALIDATION_FAILED'] \
        if checksum_error \
        else config['upload_status']['COMPLETE']


def chunks_to_files(celery_task, dataset_id, **kwargs):
    try:
        dataset = api.get_dataset(dataset_id=dataset_id, upload_log=True, workflows=True)
        upload_log = dataset['upload_log']
        upload_log_id = upload_log['id']

        file_log_updates = []
        for file_log in upload_log['files']:
            file_log_updates.append({
                'id': file_log['id'],
                'data': {
                    'status': config['upload_status']['PROCESSING']
                }
            })
        api.update_upload_log(upload_log_id, {
            'status': config['upload_status']['PROCESSING'],
            'increment_processing_count': True,
            'files': file_log_updates
        })
    except Exception as e:
        raise exc.RetryableException(e)

    dataset_path = Path(dataset['origin_path'])

    files = upload_log['files']
    pending_files = [file for file in files if file['status'] != config['upload_status']['COMPLETE']]

    for f in pending_files:
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_md5 = f['md5']
        file_upload_log_id = f['id']
        chunks_path = Path(f['chunks_path'])
        destination_path = Path(f['destination_path'])

        if f['status'] != config['upload_status']['COMPLETE']:
            try:
                f['status'] = merge_file_chunks(file_name, file_md5, chunks_path, destination_path, num_chunks_expected)
            except Exception as e:
                f['status'] = config['upload_status']['FAILED']
                print('Caught exception')
                print(e)
            finally:
                print(f"Finished processing file {file_name}. Processing Status: {f['status']}")

            try:
                api.update_file_upload_log(file_upload_log_id, {
                    'status': f['status']
                })
            except Exception as e:
                raise exc.RetryableException(e)
            else:
                if f['status'] == config['upload_status']['COMPLETE'] and chunks_path.exists():
                    shutil.rmtree(chunks_path)
                    shutil.rmtree(chunks_path.parent)

    failed_files = [file for file in pending_files if file['status'] != config['upload_status']['COMPLETE']]
    has_errors = len(failed_files) > 0

    # Update status of upload log
    try:
        api.update_upload_log(upload_log_id, {
            'status': config['upload_status']['PROCESSING_FAILED'] if has_errors else config['upload_status'][
                'COMPLETE'],
        })
    except Exception as e:
        raise exc.RetryableException(e)

    if not has_errors:
        # delete subdirectory containing all chunked files
        shutil.rmtree(dataset_path / 'chunked_files')

        workflow_name = 'integrated'
        duplicate_workflows = [
            wf for wf in dataset['workflows']
            if wf['name'] == workflow_name and
               wf['status'] not in DONE_STATUSES
        ]
        if len(duplicate_workflows) == 0:
            print("Beginning 'integrated' workflow")
            integrated_wf_body = wf_utils.get_wf_body(wf_name=workflow_name)
            int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
            api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf.workflow['_id'])
            int_wf.start(dataset_id)
        else:
            print(f'Found active workflow {workflow_name} for dataset {dataset_id}')
