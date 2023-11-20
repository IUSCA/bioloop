import shutil
import time
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow

import workers.api as api
import workers.config.celeryconfig as celeryconfig
from workers import exceptions as exc
import workers.workflow_utils as wf_utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

completed_files = []

status = {
    'FAILED': 'FAILED',
    'COMPLETE': 'COMPLETE'
}

# c3468e30cd1da55b92e2235d92ebfc91 - failed_file
# 31904f92c817767de2bb7e9241f0f7fc - approval notice
# 50ddf82278203f3813749b90c77aee24 - offer letter
def merge_file_chunks(file_name, file_hash, chunks_path, destination_path, num_chunks_expected):
    print(f'Processing file {file_name}')

    # / opt / sca / uploads / dataProductUploads / dp7 / chunked_files / 3456371
    # f46a9653a09ffddbdfd120b2e

    # Delete potentially incomplete merged attempts from before
    if destination_path.exists():
        print(f"Deleting existing destination file {destination_path}")
        destination_path.unlink()

    num_chunk_found = len([p for p in chunks_path.iterdir()])
    if num_chunk_found != num_chunks_expected:
        print('Expected number of chunks don\'t equal number of chunks found. This file\'s'
              ' chunks will not be merged')
        raise Exception(f'Expected {num_chunks_expected} chunks, but found {num_chunk_found}')
    for i in range(num_chunk_found):
        chunk_file = chunks_path / f'{file_hash}-{i}'
        print(f'Processing chunk {chunk_file}')
        print(f'Attempting to append chunk {chunk_file.name} to {destination_path}')

        # if i == 1 and (file_hash == 'c3468e30cd1da55b92e2235d92ebfc91' or file_hash == '31904f92c817767de2bb7e9241f0f7fc'):
        #     raise Exception(f"some exception that occurred during merging chunk {i} of {merged_file_path.name}")

        with open(chunk_file, 'rb') as chunk:
            with open(destination_path, 'ab') as destination:
                destination.write(chunk.read())

    print(f"Successfully merged all chunks of file {file_name} to {destination_path}")
    return status['COMPLETE']


def create_dataset_files(celery_task, dataset_upload_id, **kwargs):
    print("CREATE_FILES WORKER CALLED")

    time.sleep(60)
    print("CREATE_FILES WORKER BEGINNING")

    print("dataset_upload_id")
    print(dataset_upload_id)

    metadata_error = False
    files_processed = False
    upload_log_missing = False
    # retry if call fails
    try:
        dataset_upload_log = api.get_upload_log(dataset_upload_id)
        print('files_processed')
        print(files_processed)
    except Exception as e:
        upload_log_missing = True
        print(f"Could not fetch upload log for id {dataset_upload_id}")
        print(e)
        # raise exc.UploadLogNotFound()

    if not upload_log_missing:
        dataset = dataset_upload_log['dataset']
        dataset_path = Path(dataset['origin_path'])
        if not dataset_path.exists():
            raise exc.DatasetNotFound()
            # todo - mark upload as failed

        merge_dataset_file_chunks(dataset_upload_log['files'])


        api.post_upload_log(dataset_upload_id, {
            'status': status['COMPLETE'] if files_processed else status['FAILED']
        })

        if files_processed:
            print("reach if files_processed: block")

            # delete chunked_files subdirectory
            dataset_file_chunks_path = Path(dataset_upload_log['dataset']['origin_path'] / 'chunked_files')
            try:
                shutil.rmtree(dataset_file_chunks_path)
            except Exception as e:
                print(f"Encountered exception deleting subdirectory {dataset_file_chunks_path}")
                print(e)
            else:
                print("Beginning 'integrated' workflow")
                integrated_wf_body = wf_utils.get_wf_body(wf_name='integrated')
                int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
                api.add_workflow_to_dataset(dataset_id=dataset_upload_log['dataset_id'], workflow_id=int_wf.workflow['_id'])
                int_wf.start(dataset_upload_log['dataset_id'])


def merge_dataset_file_chunks(files):
    print("in merge_dataset_file_chunks")

    # dataset_id = dataset_upload_log['dataset_id']
    # dataset = dataset_upload_log['dataset']
    # dataset_path = Path(dataset['origin_path'])
    #
    # if not dataset_path.exists():
    #     raise exc.DatasetNotFound()

    pending_files = [file for file in files if file['status'] != status['COMPLETE']]
    dataset_files_processed = merge_chunks(pending_files)

    print('dataset_files_processed')
    print(dataset_files_processed)
    return dataset_files_processed

    # todo - catching exception may not be necessary
    # try:
    # except Exception as e:
    #     print(f"Caught exception trying to update status for upload log with id {dataset_upload_log['id']}")
    #     print(e)
    # else:


#     'files': [{
#         'file_name': 'file_1.pdf',
#         'file_hash': '31904f92c817767de2bb7e9241f0f7fc',
#         'num_chunks': 3
#         'file_log_id': 1,
#     }]
def merge_chunks(files):
    for f in files:
        file_log_id = f['id']
        chunks_path = Path(f['chunks_path'])
        destination_path = Path(f['destination_path'])
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_hash = f['hash']

        try:
            f['status'] = merge_file_chunks(file_name, file_hash, chunks_path, destination_path, num_chunks_expected)
        except Exception as e:
            print("Encountered exception:")
            print(e)
            f['status'] = status['FAILED']
            if destination_path.exists():
                print(f"Deleting destination file {destination_path}")
                destination_path.unlink()
        finally:
            print(f"Finished processing file {file_name}. Processing Status: {f['status']}")
            file_upload_details = {
                'status': f['status']
            }
            # todo - catching exception may not be necessary
            try:
                api.post_file_upload_details(file_log_id, file_upload_details)
            except Exception as e:
                print(f"Could not update status for file {file_name}")
                print(e)
            else:
                if f['status'] == status['COMPLETE']:
                    shutil.rmtree(chunks_path)
                    shutil.rmtree(chunks_path.parent)

    failed_files = [file for file in files if file['status'] == status['FAILED']]

    print('files')
    print(files)

    return len(failed_files) == 0

