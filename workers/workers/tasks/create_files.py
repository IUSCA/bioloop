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
def merge_file_chunks(file_hash, chunks_path, merged_file_path, num_chunks_expected):
    num_chunk_found = len([p for p in chunks_path.iterdir()])
    if num_chunk_found != num_chunks_expected:
        print('Expected number of chunks don\'t equal number of chunks found. This file\'s'
              ' chunks will not be merged')
        raise Exception(f'Expected {num_chunks_expected} chunks, but found {num_chunk_found}')
    for i in range(num_chunk_found):
        chunk_file = chunks_path / f'{file_hash}-{i}'
        print(f'Processing chunk {chunk_file}')
        print(f'Appending chunk {chunk_file.name} to {merged_file_path}')

        # if file_hash == 'c3468e30cd1da55b92e2235d92ebfc91' or file_hash == '31904f92c817767de2bb7e9241f0f7fc':
        #     raise Exception("some exception that occurred during merge")

        with open(chunk_file, 'rb') as chunk:
            with open(merged_file_path, 'ab') as destination:
                destination.write(chunk.read())
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
def create_dataset_files(celery_task, attrs, **kwargs):
    print("CREATE_FILES WORKER CALLED")
    print("attrs")
    print(attrs)

    dataset_upload_id = attrs['dataset_upload_id']
    dataset_upload_log = api.get_upload_log(dataset_upload_id)

    data_product_id = dataset_upload_log['data_product_id']
    data_product = dataset_upload_log['dataset']
    data_product_path = data_product['origin_path']

    files_attrs = dataset_upload_log['files']

    for f in files_attrs:
        source_path = f['path']
        file_name = f['file_name']
        num_chunks_expected = f['num_chunks']
        file_hash = f['file_hash']
        file_log_id = f['file_log_id']
        chunks_path = source_path / 'chunks'
        merged_file_path = data_product_path / file_name

        print(f'Processing file {file_name}')

        try:
            f['merge_status'] = merge_file_chunks(file_hash, chunks_path, merged_file_path, num_chunks_expected)
        except Exception as e:
            print("Encountered exception:")
            print(e)
            f['merge_status'] = status['FAILED']
            print(f"Deleting file {merged_file_path}")
            merged_file_path.unlink()

        print(f"Finished processing file {file_name}. Processing Status: {f['merge_status']}")

        file_upload_details = {
            'status': f['merge_status']
        }
        api.post_file_upload_details(file_log_id, file_upload_details)

        if f['merge_status'] == status['COMPLETE']:
            shutil.rmtree(chunks_path)

    failed_files = [file for file in files_attrs if file['merge_status'] == status['FAILED']]
    some_files_failed = len(failed_files) > 0

    if not some_files_failed:
        integrated_wf_body = wf_utils.get_wf_body(wf_name='integrated')
        int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
        api.add_workflow_to_dataset(dataset_id=data_product_id, workflow_id=int_wf.workflow['_id'])
        int_wf.start(data_product_id)

    api.post_upload_log(dataset_upload_id, {
        'status': status['FAILED'] if some_files_failed else status['COMPLETE']
    })



