import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow
import json

from workers import exceptions as exc
import workers.api as api
from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
import workers.utils as utils

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

DONE_STATUSES = [config['DONE_STATUSES']['REVOKED'],
                 config['DONE_STATUSES']['FAILURE'],
                 config['DONE_STATUSES']['SUCCESS']]


def merge_file_chunks(file_upload_log_id, file_name, file_path,
                      file_md5, chunks_path, dataset_merged_chunks_path,
                      num_chunks_expected):
    print(f'Processing file {file_name}')
    processing_error = False

    if file_path is not None:
        file_base_path = Path(dataset_merged_chunks_path) / file_path
        file_base_path.mkdir(parents=True, exist_ok=True)
        file_destination_path = file_base_path / file_name
    else:
        file_destination_path = Path(dataset_merged_chunks_path) / file_name

    if file_destination_path.exists():
        print(f'Destination path {file_destination_path} already exists for file {file_name}\
(file_upload_log_id {file_upload_log_id})')
        print(f'Deleting existing destination path {file_destination_path}')
        file_destination_path.unlink()

    print(f'Creating destination path {file_destination_path}')
    file_destination_path.touch()
    print('Destination path created: ', file_destination_path.exists())

    num_chunks_found = len([p for p in chunks_path.iterdir()])
    if num_chunks_found != num_chunks_expected:
        processing_error = True
        print(f'Expected number of chunks for file\
 id {file_upload_log_id} ({num_chunks_expected}) don\'t\
 equal number of chunks found {num_chunks_found}.\
 This file\'s chunks will not be merged')
    else:
        for i in range(num_chunks_found):
            chunk_file = chunks_path / f'{file_md5}-{i}'
            print(f'Processing chunk {chunk_file}')
            with open(chunk_file, 'rb') as chunk:
                with open(file_destination_path, 'ab') as destination:
                    destination.write(chunk.read())
        print(f'Chunks for file id {file_upload_log_id} ({file_name}) merged successfully')

        evaluated_checksum = utils.checksum(file_destination_path)
        print(f'evaluated_checksum: {evaluated_checksum}')
        print(f'file_md5: {file_md5}')
        processing_error = evaluated_checksum != file_md5

    return config['upload']['status']['PROCESSING_FAILED'] \
        if processing_error \
        else config['upload']['status']['COMPLETE']


def chunks_to_files(celery_task, dataset_id, **kwargs):
    upload_log_id = None
        
    try:
        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
        upload_log = dataset['upload_log']
        upload_log_id = upload_log['id']
        upload_log_files = upload_log['files']

        file_log_updates = []
        for file_log in upload_log_files:
            if file_log['status'] != config['upload']['status']['COMPLETE']:
                file_log_updates.append({
                    'id': file_log['id'],
                    'data': {
                        'status': config['upload']['status']['PROCESSING']
                    }
                })
        api.update_upload_log(upload_log_id, {
            'status': config['upload']['status']['PROCESSING'],
            'files': file_log_updates
        })
    except Exception as e:
        raise exc.RetryableException(e)

    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset['id'])

    if not dataset_path.exists():
        raise Exception(f"Upload directory {dataset_path} does not exist for\
 dataset id {dataset_id} (upload_log_id: {upload_log_id})")

    pending_files = [file for file in upload_log_files if file['status'] != config['upload']['status']['COMPLETE']]

    dataset_merged_chunks_path = dataset_path / 'merged_chunks'
    if not dataset_merged_chunks_path.exists():
        print(f"Creating merged_chunks path {dataset_merged_chunks_path} for\
 dataset id {dataset_id} (upload_log_id: {upload_log_id})")
        dataset_merged_chunks_path.mkdir()
        print(f"Created merged_chunks path {dataset_merged_chunks_path}")

    for f in pending_files:
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_md5 = f['md5']
        file_upload_log_id = f['id']
        file_path = f['path']

        chunks_path = dataset_path / 'chunked_files' / str(file_upload_log_id)

        if not chunks_path.exists():
            raise Exception(f"Chunks directory {chunks_path} does not exist\
 for file {file_name} (file_upload_log_id: {file_upload_log_id})")

        try:
            f['status'] = merge_file_chunks(file_upload_log_id, file_name, file_path,
                                            file_md5, chunks_path, dataset_merged_chunks_path,
                                            num_chunks_expected)
        except Exception as e:
            f['status'] = config['upload']['status']['PROCESSING_FAILED']
            print(e)
        finally:
            print(f"Finished processing file {file_name}. Processing Status: {f['status']}")
        api.update_file_upload_log(
                upload_log_id,
                file_upload_log_id,
                {
                  'status': f['status']
                }
            )
        if f['status'] == config['upload']['status']['PROCESSING_FAILED']:
            raise Exception(f"Failed to process file {file_name} (file_upload_log_id: {file_upload_log_id})")

    failed_files = [file for file in pending_files if file['status'] != config['upload']['status']['COMPLETE']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        print(f'All uploaded files for dataset {dataset_id} (upload_log_id: {upload_log_id})\
 have been processed successfully.')
        workflow_name = 'integrated'
        print(f"Beginning {workflow_name} workflow for dataset {dataset['id']} (upload_log_id: {upload_log_id})")
        integrated_wf_body = wf_utils.get_wf_body(wf_name=workflow_name)
        int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf.workflow['_id'])
        int_wf.start(dataset_id)

    # Update status of upload log
    try:
        api.update_upload_log(upload_log_id, {
            'status': config['upload']['status']['PROCESSING_FAILED'] if has_errors else config['upload']['status'][
                'COMPLETE'],
        })
    except Exception as e:
        raise exc.RetryableException(e)

    return dataset_id,