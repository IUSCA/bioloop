from json import dumps
from traceback import print_tb, format_exc
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


def merge_file_chunks(file_name, rel_path, file_md5, chunks_path, destination_path, num_chunks_expected):
    print(f'Processing file {file_name}')
    processing_error = False

    if rel_path is not None:
        file_destination_path = Path(destination_path) / rel_path
    else:
        file_destination_path = Path(destination_path)

    if not file_destination_path.exists():
        file_destination_path.mkdir(parents=True)

    try:
        num_chunks_found = len([p for p in chunks_path.iterdir()])
        if num_chunks_found != num_chunks_expected:
            print('Expected number of chunks don\'t equal number of chunks found. This file\'s'
                  ' chunks will not be merged')
            processing_error = True

        if not processing_error:
            for i in range(num_chunks_found):
                chunk_file = chunks_path / f'{file_md5}-{i}'
                print(f'Processing chunk {chunk_file}')
                # with open(dataset_path, 'ab') as destination:
                with open(chunk_file, 'rb') as chunk:
                    with open(file_destination_path, 'ab') as destination:
                        destination.write(chunk.read())
            # todo - close file handles

        # evaluated_checksum = utils.checksum(dataset_path)
        # print(f'evaluated_checksum: {evaluated_checksum}')
        # print("Failed checksum validation")
        # processing_error = evaluated_checksum != file_md5
    except Exception as e:
        processing_error = True
        # format_exc(e)
        raise Exception(e)

    return config['upload_status']['PROCESSING_FAILED'] \
        if processing_error \
        else config['upload_status']['COMPLETE']


def chunks_to_files(celery_task, dataset_id, **kwargs):
    print("chunks_to_files called")
    
    try:
        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
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
        # raise exc.RetryableException(e)
        raise Exception(e)
        # format_exc(e)


    # dataset_path = Path(dataset['origin_path'])
    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / dataset['name']

    files = upload_log['files']
    pending_files = [file for file in files if file['status'] != config['upload_status']['COMPLETE']]

    for f in pending_files:
        print(f"creating chunks for file:")
        print(dumps(f, indent=4))
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_md5 = f['md5']
        file_upload_log_id = f['id']
        file_rel_path = f['path']

        chunks_path = Path(config['paths']['DATA_PRODUCT']['upload']) / dataset['name'] / 'chunked_files' / f['md5']
        print("Created chunks path", chunks_path)

        destination_path = Path(config['paths']['DATA_PRODUCT']['upload']) / dataset['name'] / 'merged_chunks'
        if destination_path.exists():
            shutil.rmtree(destination_path)
        print("Creating destination path")
        destination_path.mkdir()
        print("Created destination path")
        
        if f['status'] != config['upload_status']['COMPLETE']:
            try:
                f['status'] = merge_file_chunks(file_name, file_rel_path, file_md5, chunks_path, destination_path, num_chunks_expected)
            except Exception as e:
                f['status'] = config['upload_status']['PROCESSING_FAILED']
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
            # else:
            #     if f['status'] == config['upload_status']['COMPLETE'] and chunks_path.exists():
            #         shutil.rmtree(chunks_path)
            #         shutil.rmtree(chunks_path.parent)

    failed_files = [file for file in pending_files if file['status'] != config['upload_status']['COMPLETE']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        # delete subdirectory containing all chunked files
        chunked_files_path = Path(dataset_path) / 'chunked_files'
        # if chunked_files_path.exists():
        #     shutil.rmtree(dataset_path / 'chunked_files')

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

    # Update status of upload log
    try:
        api.update_upload_log(upload_log_id, {
            'status': config['upload_status']['PROCESSING_FAILED'] if has_errors else config['upload_status'][
                'COMPLETE'],
        })
    except Exception as e:
        raise exc.RetryableException(e)
