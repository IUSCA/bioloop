import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow

import workers.api as api
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

status = {
    'FAILED': 'FAILED',
    'COMPLETE': 'COMPLETE'
}

# c3468e30cd1da55b92e2235d92ebfc91 - failed_file
# 31904f92c817767de2bb7e9241f0f7fc - approval notice
# 50ddf82278203f3813749b90c77aee24 - offer letter
def merge_file_chunks(file_name, file_hash, chunks_path, destination_path, num_chunks_expected):
    print(f'Processing file {file_name}')

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

# attrs = {
#     'dataset_upload_id': 'test',
#     'data_product_id': 1,
#     'data_product_name': 'name',
#     'file_attrs': [{
#         'file_name': 'file_1.pdf',
#         'file_hash': '31904f92c817767de2bb7e9241f0f7fc',
#         'num_chunks': 3
#         'file_log_id': 1,
#     }]
# }
def create_dataset_files(celery_task, dataset_upload_id, **kwargs):
    print("CREATE_FILES WORKER CALLED")
    print("dataset_upload_id")
    print(dataset_upload_id)

    dataset_upload_log = api.get_upload_log(dataset_upload_id)
    print('dataset_upload_log')
    print(dataset_upload_log)

    dataset_id = dataset_upload_log['dataset_id']
    dataset = dataset_upload_log['dataset']
    dataset_path = Path(dataset['origin_path'])

    files = dataset_upload_log['files']
    pending_files = [file for file in files if file['status'] != status['COMPLETE']]

    for f in pending_files:
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_hash = f['hash']
        file_log_id = f['id']
        # / opt / sca / uploads / dataProductUploads / dp7 / chunked_files / 3456371
        # f46a9653a09ffddbdfd120b2e / chunks
        chunks_path = Path(f['chunks_path'])
        destination_path = Path(f['destination_path'])

        try:
            f['status'] = merge_file_chunks(file_name, file_hash, chunks_path, destination_path, num_chunks_expected)
        except Exception as e:
            print("Encountered exception:")
            print(e)
            f['status'] = status['FAILED']
            print(f"Deleting file {destination_path}")
            if destination_path.exists():
                destination_path.unlink()

        print(f"Finished processing file {file_name}. Processing Status: {f['status']}")

        file_upload_details = {
            'status': f['status']
        }
        api.post_file_upload_details(file_log_id, file_upload_details)

        # todo - is this reached when exception is thrown in the post_file_upload call?
        if f['status'] == status['COMPLETE']:
            shutil.rmtree(chunks_path)
            shutil.rmtree(chunks_path.parent)

    failed_files = [file for file in pending_files if file['status'] == status['FAILED']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        # delete chunked_files subdirectory
        try:
            shutil.rmtree(dataset_path / 'chunked_files')
        except Exception as e:
            print(f"Encountered exception deleting subdirectory {dataset_path / 'chunked_files'}")
            print(e)
            has_errors = True
        else:
            print("Beginning 'integrated' workflow")
            integrated_wf_body = wf_utils.get_wf_body(wf_name='integrated')
            int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
            api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf.workflow['_id'])
            int_wf.start(dataset_id)

    api.post_upload_log(dataset_upload_id, {
        'status': status['FAILED'] if has_errors else status['COMPLETE']
    })



