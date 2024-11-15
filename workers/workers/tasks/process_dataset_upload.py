import os
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


def num_files_in_directory(directory_path: Path) -> int:
    return sum([len(files) for r, _, files in os.walk(directory_path) if files])


def create_file_from_chunks(file_chunks_path: Path,
                            file_destination_path: Path,
                            file_md5: str,
                            num_chunks_found: int) -> None:
    for i in range(num_chunks_found):
        chunk_file = file_chunks_path / f'{file_md5}-{i}'
        print(f'Processing chunk {chunk_file}')
        with open(str(chunk_file), 'rb') as chunk:
            with open(str(file_destination_path), 'ab') as destination:
                destination.write(chunk.read())


def merge_uploaded_file_chunks(file_upload_log_id: int,
                               file_name: str,
                               file_md5: str,
                               file_path: Path,
                               uploaded_chunks_path: Path,
                               merged_chunks_path: Path,
                               num_chunks_expected: int) -> str:
    print(f'Processing file {file_name}')

    if file_path is not None:
        file_base_path = merged_chunks_path / file_path
        file_base_path.mkdir(parents=True, exist_ok=True)
        file_destination_path = file_base_path / file_name
    else:
        file_destination_path = merged_chunks_path / file_name

    if file_destination_path.exists():
        print(f'Destination path {file_destination_path} already exists for file {file_name}\
(file_upload_log_id {file_upload_log_id})')
        print(f'Deleting existing destination path {file_destination_path}')
        file_destination_path.unlink()

    print(f'Creating destination path {file_destination_path}')
    file_destination_path.touch()
    print('Destination path created: ', file_destination_path.exists())

    num_chunks_found = len([p for p in uploaded_chunks_path.iterdir() if p.name.startswith(f'{file_md5}-')])

    if num_chunks_found == num_chunks_expected:
        create_file_from_chunks(file_chunks_path=uploaded_chunks_path,
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

    return config['upload']['status']['PROCESSING_FAILED'] \
        if processing_error \
        else config['upload']['status']['COMPLETE']


# Updates the upload status of a given dataset's upload and uploaded files to PROCESSING
def update_upload_status_to_processing(dataset: dict):
    dataset_upload_log = dataset['dataset_upload_log']
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
    print(f"Updating upload status of dataset upload log {dataset_upload_log['id']} \
          and it's files to {config['upload']['status']['PROCESSING']}")
    try:
        api.update_dataset_upload_log(
            uploaded_dataset_id=dataset['id'],
            log_data={
                'status': config['upload']['status']['PROCESSING'],
                'files': file_log_updates
            }
        )
    except Exception as e:
        raise exc.RetryableException(e)


def process_dataset_upload(dataset: dict) -> None:
    dataset_id = dataset['id']
    dataset_upload_log = dataset['dataset_upload_log']
    dataset_upload_log_id = dataset_upload_log['id']
    upload_log = dataset_upload_log['upload_log']
    upload_log_files = upload_log['files']

    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset['id'])
    # print(f"Upload directory: {dataset_path}")
    # time.sleep(30)
    if not dataset_path.exists():
        raise Exception(f"Upload directory {dataset_path} does not exist for\
        dataset id {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})")

    files_pending_processing = [file for file in upload_log_files if
                                file['status'] != config['upload']['status']['COMPLETE']]

    dataset_merged_chunks_path = dataset_path / 'processed'
    if not dataset_merged_chunks_path.exists():
        print(f"Creating upload processing path {dataset_merged_chunks_path} for \
         dataset id {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})")
        dataset_merged_chunks_path.mkdir()
        print(f"Created upload processing path {dataset_merged_chunks_path}")

    for f in files_pending_processing:
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
            f['status'] = merge_uploaded_file_chunks(file_upload_log_id=file_upload_log_id,
                                                     file_name=file_name,
                                                     file_path=file_path,
                                                     file_md5=file_md5,
                                                     uploaded_chunks_path=chunks_path,
                                                     merged_chunks_path=dataset_merged_chunks_path,
                                                     num_chunks_expected=num_chunks_expected)
        except Exception as e:
            f['status'] = config['upload']['status']['PROCESSING_FAILED']
            print(f"Encountered error while processing file {file_name} (file_upload_log_id: {file_upload_log_id}):\n")
            print(e)
        finally:
            print(f"Finished processing file {file_name}. Processing Status: {f['status']}")

        upload_log_payload = {
            'files': [{
                'id': file_upload_log_id,
                'data': {
                    'status': f['status']
                }
            }]
        }
        updated_upload_status = config['upload']['status']['PROCESSING_FAILED'] if (
                f['status'] == config['upload']['status']['PROCESSING_FAILED']
        ) else None
        if updated_upload_status is not None:
            upload_log_payload['status'] = updated_upload_status
        try:
            api.update_dataset_upload_log(
                uploaded_dataset_id=dataset_id,
                log_data=upload_log_payload
            )
        except Exception as e:
            raise exc.RetryableException(e)

        if f['status'] == config['upload']['status']['PROCESSING_FAILED']:
            raise Exception(f"Failed to process file {file_name} (file_upload_log_id: {file_upload_log_id})")

    files_failed_processing = [file for file in files_pending_processing if
                               file['status'] != config['upload']['status']['COMPLETE']]
    processed_with_errors = len(files_failed_processing) > 0

    processed_file_count = num_files_in_directory(dataset_merged_chunks_path)
    print(f"Number of files uploaded: {len(upload_log_files)}")
    print(f"Number of files processed {processed_file_count}")
    processed_with_errors = processed_with_errors and (processed_file_count != len(upload_log_files))
    print(f"processed_with_errors: {processed_with_errors}")

    if not processed_with_errors:
        print(f'All uploaded files for dataset {dataset_id} (dataset_upload_log_id: {dataset_upload_log_id})\
            have been processed successfully.')
        try:
            # Update status of upload to COMPLETE
            print(f"Updating upload status of dataset upload log {dataset_upload_log_id} to COMPLETE")
            api.update_dataset_upload_log(
                uploaded_dataset_id=dataset_id,
                log_data={
                    'status': config['upload']['status']['COMPLETE'],
                }
            )
        except Exception as e:
            raise exc.RetryableException(e)


def process(celery_task, dataset_id, **kwargs):
    print(f'Processing dataset {dataset_id}\'s upload')

    try:
        dataset = api.get_dataset(dataset_id=dataset_id, include_upload_log=True, workflows=True)
    except Exception as e:
        raise exc.RetryableException(e)
    dataset_upload_log = dataset['dataset_upload_log']
    dataset_upload_log_id = dataset_upload_log['id']
    upload_log = dataset_upload_log['upload_log']

    if upload_log['status'] == config['upload']['status']['COMPLETE']:
        print(f"Dataset upload log {dataset_upload_log_id} has already been processed (current status: COMPLETE)")
    else:
        print(f"Dataset upload log {dataset_upload_log_id} will be processed (current status: {upload_log['status']})")
        try:
            update_upload_status_to_processing(dataset=dataset)
        except Exception as e:
            raise exc.RetryableException(e)
        process_dataset_upload(dataset=dataset)

    print(f"Workflow {INTEGRATED_WORKFLOW} can be started for dataset {dataset_id}")

    print(f"Looking for active workflows of type {INTEGRATED_WORKFLOW} for dataset {dataset_id}")
    active_integrated_wfs = [wf for wf in dataset['workflows'] if wf['name'] == INTEGRATED_WORKFLOW]
    if len(active_integrated_wfs) > 0:
        print(f"One or more workflows of type {INTEGRATED_WORKFLOW} are already running\
               for dataset {dataset_id}, dataset_upload_log_id {dataset_upload_log_id}:")
        for wf in active_integrated_wfs:
            print(f"Workflow ID: {wf['id']}, Status: {wf['status']}")
        print(f"A new {INTEGRATED_WORKFLOW} workflow will not be started.")
    else:
        print(f"No active workflows of type {INTEGRATED_WORKFLOW} found for dataset {dataset_id}")
        print(f"Starting {INTEGRATED_WORKFLOW} workflow for dataset {dataset['id']}")
        integrated_wf_body = wf_utils.get_wf_body(wf_name=INTEGRATED_WORKFLOW)
        int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
        int_wf_id = int_wf.workflow['_id']
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf_id)
        int_wf.start(dataset_id)
        print(f"Started workflow {int_wf} for dataset {dataset_id}")

    # purge uploaded files from the filesystem
    dataset_path = Path(config['paths']['DATA_PRODUCT']['upload']) / str(dataset['id'])
    uploaded_chunks_path = dataset_path / 'uploaded_chunks'
    if uploaded_chunks_path.exists():
        shutil.rmtree(uploaded_chunks_path)

    return dataset_id,
