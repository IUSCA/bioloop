import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow

from workers import exceptions as exc
import workers.api as api
from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
import workers.utils as utils

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

INTEGRATED_WORKFLOW = 'integrated'
DONE_STATUSES = [config['DONE_STATUSES']['REVOKED'],
                 config['DONE_STATUSES']['FAILURE'],
                 config['DONE_STATUSES']['SUCCESS']]


def create_file_from_chunks(chunks_path, file_md5, file_destination_path, num_chunks_found):
    for i in range(num_chunks_found):
        chunk_file = chunks_path / f'{file_md5}-{i}'
        print(f'Processing chunk {chunk_file}')
        with open(chunk_file, 'rb') as chunk:
            with open(file_destination_path, 'ab') as destination:
                destination.write(chunk.read())


def merge_file_chunks(file_upload_log_id, file_name, file_path,
                      file_md5, chunks_path, dataset_merged_chunks_path,
                      num_chunks_expected):
    print(f'Processing file {file_name}')

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

    num_chunks_found = len([p for p in chunks_path.iterdir() if str(p).startswith(f'{file_md5}-')])

    if num_chunks_found == num_chunks_expected:
        create_file_from_chunks(chunks_path=chunks_path,
                                file_md5=file_md5,
                                file_destination_path=file_destination_path,
                                num_chunks_found=num_chunks_found)
        print(f'Chunks for file upload {file_upload_log_id} ({file_name}) merged successfully')
        evaluated_checksum = utils.checksum(file_destination_path)
        print(f'evaluated_checksum: {evaluated_checksum}')
        print(f'expected file_md5: {file_md5}')
        processing_error = evaluated_checksum != file_md5
    else:
        processing_error = True
        print(f'Expected number of chunks for file id {file_upload_log_id}'
              f' ({num_chunks_expected}) don\'t equal number of chunks found'
              f' ({num_chunks_found}). This file\'s will not be processed')

    # raise Exception("test exception")

    return config['upload']['status']['PROCESSING_FAILED'] \
        if processing_error \
        else config['upload']['status']['COMPLETE']


def chunks_to_files(celery_task, dataset_id, **kwargs):
    print(f'Processing dataset {dataset_id}\'s uploaded resources')

    try:
        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
        dataset_upload_log = dataset['dataset_upload_log']
        dataset_upload_log_id = dataset_upload_log['id']

        upload_log = dataset_upload_log['upload_log']
        upload_log_files = upload_log['files']

        file_log_updates = []
        for file_log in upload_log_files:
            if (file_log['status'] != config['upload']['status']['COMPLETE']
                    and file_log['status'] != config['upload']['status']['PROCESSING']):
                file_log_updates.append({
                    'id': file_log['id'],
                    'data': {
                        'status': config['upload']['status']['PROCESSING']
                    }
                })
        api.update_dataset_upload_log(
            uploaded_dataset_id=dataset_id,
            log_data={
                'status': config['upload']['status']['PROCESSING'],
                'files': file_log_updates
            }
        )
    except Exception as e:
        raise exc.RetryableException(e)

    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset['id'])

    if not dataset_path.exists():
        raise Exception(f"Upload directory {dataset_path} does not exist for\
 dataset id {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})")

    pending_files = [file for file in upload_log_files if file['status'] != config['upload']['status']['COMPLETE']]

    dataset_merged_chunks_path = dataset_path / 'processed'
    if not dataset_merged_chunks_path.exists():
        print(f"Creating upload processing path {dataset_merged_chunks_path} for\
 dataset id {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})")
        dataset_merged_chunks_path.mkdir()
        print(f"Created upload processing path {dataset_merged_chunks_path}")

    for f in pending_files:
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_md5 = f['md5']
        file_upload_log_id = f['id']
        file_path = f['path']
        chunks_path = dataset_path / 'uploaded_chunks' / str(file_upload_log_id)

        if not chunks_path.exists():
            raise Exception(f"Chunks directory {chunks_path} does not exist\
 for file {file_name} (file_upload_log_id: {file_upload_log_id})")

        try:
            f['status'] = merge_file_chunks(file_upload_log_id, file_name, file_path,
                                            file_md5, chunks_path, dataset_merged_chunks_path,
                                            num_chunks_expected)
        except Exception as e:
            f['status'] = config['upload']['status']['PROCESSING_FAILED']
            print(f"Encountered error while processing file {file_name} (file_upload_log_id: {file_upload_log_id}):\n")
            print(e)
        finally:
            print(f"Finished processing file {file_name}. Processing Status: {f['status']}")

        file_upload_log_payload = {
            'status': f['status']
        }
        updated_upload_status = config['upload']['status']['PROCESSING_FAILED'] if (
                f['status'] == config['upload']['status']['PROCESSING_FAILED']
        ) else None
        upload_log_payload = {
            'files': [{
                'id': file_upload_log_id,
                'data': file_upload_log_payload
            }]
        }
        if updated_upload_status is not None:
            upload_log_payload['status'] = updated_upload_status
        api.update_dataset_upload_log(
            uploaded_dataset_id=dataset_id,
            log_data=upload_log_payload
        )
        if f['status'] == config['upload']['status']['PROCESSING_FAILED']:
            raise Exception(f"Failed to process file {file_name} (file_upload_log_id: {file_upload_log_id})")

    failed_files = [file for file in pending_files if file['status'] != config['upload']['status']['COMPLETE']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        try:
            # Update status of upload to COMPLETE
            api.update_dataset_upload_log(
                uploaded_dataset_id=dataset_id,
                log_data={
                    'status': config['upload']['status']['PROCESSING_FAILED'] if has_errors else config['upload']['status'][
                        'COMPLETE'],
                }
            )
        except Exception as e:
            raise exc.RetryableException(e)

        print(f'All uploaded files for dataset {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})\
    have been processed successfully.')

        active_integrated_wfs = [wf for wf in dataset['workflows'] if wf['name'] == INTEGRATED_WORKFLOW]
        if len(active_integrated_wfs) > 0:
            print(f"Workflow {INTEGRATED_WORKFLOW} is already running for dataset {dataset_id}"
                  f" (dataset_upload_log_id: {dataset_upload_log_id})")
        else:
            print(f"Starting {INTEGRATED_WORKFLOW} workflow for dataset {dataset['id']}"
                  f" (dataset_upload_log_id: {dataset_upload_log_id})")
            integrated_wf_body = wf_utils.get_wf_body(wf_name=INTEGRATED_WORKFLOW)
            int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
            int_wf_id = int_wf.workflow['_id']
            api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf_id)
            int_wf.start(dataset_id)
            print(f"Started workflow {int_wf} for dataset {dataset_id}")

        # purge uploaded files from the filesystem
        shutil.rmtree(dataset_path / 'uploaded_chunks')

    return dataset_id,