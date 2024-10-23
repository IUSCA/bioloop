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

    file_destination_path = None

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
        shutil.rmtree(file_destination_path)

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


    # if not processing_error:
    #     evaluated_checksum = utils.checksum(dataset_path)
    #     print(f'evaluated_checksum: {evaluated_checksum}')
    #     print("Failed checksum validation")
    #     processing_error = evaluated_checksum != file_md5

    return config['upload_status']['PROCESSING_FAILED'] \
        if processing_error \
        else config['upload_status']['COMPLETE']


def chunks_to_files(celery_task, dataset_id, **kwargs):
    # dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
    # # json.dumps(dataset, indent=2)
    # upload_log = dataset['upload_log']
    
    # upload_log_id = upload_log['id']
    # print(f'upload_log is none: {upload_log is None}')
    # print(f'upload_log id: {upload_log["id"]}, status: {upload_log["status"]}')
    # # json.dumps(upload_log, indent=2)
    # print(f'upload_log files: {len(upload_log["files"])}')

    upload_log_files = None

    try:
        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
        upload_log = dataset['upload_log']
        upload_log_id = upload_log['id']
        upload_log_files = upload_log['files']

        # json.dumps(upload_log['files'], indent=2)

        file_log_updates = []
        for file_log in upload_log_files:
            if file_log['status'] != config['upload_status']['COMPLETE']:
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

    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / dataset['name']

    if not dataset_path.exists():
        raise Exception(f"Upload directory {dataset_path} does not exist for\
 dataset id {dataset_id} (upload_log_id: {upload_log_id})")

    pending_files = [file for file in upload_log_files if file['status'] != config['upload_status']['COMPLETE']]

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

        chunks_path = dataset_path / 'chunked_files' / f['md5']

        if not chunks_path.exists():
            raise Exception(f"Chunks directory {chunks_path} does not exist\
 for file {file_name} (file_upload_log_id: {file_upload_log_id})")

        try:
            f['status'] = merge_file_chunks(file_upload_log_id, file_name, file_path,
                                            file_md5, chunks_path, dataset_merged_chunks_path,
                                            num_chunks_expected)
        except Exception as e:
            f['status'] = config['upload_status']['PROCESSING_FAILED']
            print(e)
        finally:
            print(f"Finished processing file {file_name}. Processing Status: {f['status']}")

        try:
            api.update_file_upload_log(file_upload_log_id, {
                'status': f['status']
            })
        except Exception as e:
            raise exc.RetryableException(e)

    failed_files = [file for file in pending_files if file['status'] != config['upload_status']['COMPLETE']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        print(f'All uploaded files for dataset {dataset_id} (upload_log_id: {upload_log_id})\
 have been processed successfully.')
        # delete subdirectory containing all chunked files
        # chunked_files_path = Path(dataset_path) / 'chunked_files'
        # if chunked_files_path.exists():
#             print(f'All uploaded files for dataset {dataset_id} (upload_log_id: {upload_log_id})\
#  have been processed successfully. Deleting chunked files directory\
#  {chunked_files_path}')
#             shutil.rmtree(chunked_files_path)
#             print(f'Deleted chunked files directory {chunked_files_path}')

        workflow_name = 'integrated'
        # duplicate_workflows = [
        #     wf for wf in dataset['workflows']
        #     if wf['name'] == workflow_name and
        #        wf['status'] not in DONE_STATUSES
        # ]
        # if len(duplicate_workflows) == 0:
        print(f"Beginning {workflow_name} workflow for dataset {dataset['id']} (upload_log_id: {upload_log_id})")
        integrated_wf_body = wf_utils.get_wf_body(wf_name=workflow_name)
        int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf.workflow['_id'])
        int_wf.start(dataset_id)
        # else:
        #     print(f'Found active workflow {workflow_name} for dataset {dataset_id}')

    # Update status of upload log
    try:
        api.update_upload_log(upload_log_id, {
            'status': config['upload_status']['PROCESSING_FAILED'] if has_errors else config['upload_status'][
                'COMPLETE'],
        })
    except Exception as e:
        raise exc.RetryableException(e)

    return dataset_id,