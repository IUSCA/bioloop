import time
import shutil
from pathlib import Path
from celery import Celery
from celery.utils.log import get_task_logger
from celery import current_app
from sca_rhythm import WorkflowTask, Workflow
from datetime import datetime

from workers import exceptions as exc
import workers.api as api
from workers.config import config
import workers.config.celeryconfig as celeryconfig
import workers.workflow_utils as wf_utils

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


# c3468e30cd1da55b92e2235d92ebfc91 - failed_file
# 31904f92c817767de2bb7e9241f0f7fc - approval notice
# 50ddf82278203f3813749b90c77aee24 - offer letter
def merge_file_chunks(file_name, file_md5, chunks_path, destination_path, num_chunks_expected):
    print(f'Processing file {file_name}')

    if destination_path.exists():
        print(f"Destination path {destination_path} exits and will be deleted")
        destination_path.unlink()

    num_chunk_found = len([p for p in chunks_path.iterdir()])
    if num_chunk_found != num_chunks_expected:
        print('Expected number of chunks don\'t equal number of chunks found. This file\'s'
              ' chunks will not be merged')
        raise Exception(f'Expected {num_chunks_expected} chunks, but found {num_chunk_found}')
    for i in range(num_chunk_found):
        chunk_file = chunks_path / f'{file_md5}-{i}'
        print(f'Processing chunk {chunk_file}')
        print(f'Attempting to append chunk {chunk_file.name} to {destination_path}')

        # if i == 1 and (file_md5 == 'b92f25d60b04b0ce4cc3f6e58de48845'):
        #     raise Exception(f"some exception that occurred during merging chunk {i} of {destination_path.name}")

        with open(chunk_file, 'rb') as chunk:
            with open(destination_path, 'ab') as destination:
                destination.write(chunk.read())

    print(f"Successfully merged all chunks of file {file_name} to {destination_path}")
    return config['upload_status']['COMPLETE']


def chunks_to_files(celery_task, upload_log_id, **kwargs):
    print("CREATE_FILES WORKER CALLED")
    print("upload_log_id")
    print(upload_log_id)

    try:
        upload_log = api.get_upload_log(upload_log_id)
        print('upload_log')
        print(upload_log)

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

    # time.sleep(60)

    dataset_id = upload_log['dataset_id']
    dataset = upload_log['dataset']
    dataset_path = Path(dataset['origin_path'])

    files = upload_log['files']
    pending_files = [file for file in files if file['status'] != config['upload_status']['COMPLETE']]

    for f in pending_files:
        file_name = f['name']
        num_chunks_expected = f['num_chunks']
        file_md5 = f['md5']
        file_upload_log_id = f['id']
        # / opt / sca / uploads / dataProductUploads / dp7 / chunked_files / 3456371
        # f46a9653a09ffddbdfd120b2e / chunks
        chunks_path = Path(f['chunks_path'])
        destination_path = Path(f['destination_path'])

        if f['status'] != config['upload_status']['COMPLETE']:
            try:
                f['status'] = merge_file_chunks(file_name, file_md5, chunks_path, destination_path, num_chunks_expected)
            except Exception as e:
                f['status'] = config['upload_status']['FAILED']
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

    failed_files = [file for file in pending_files if file['status'] == config['upload_status']['FAILED']]
    has_errors = len(failed_files) > 0

    if not has_errors:
        # delete subdirectory containing all chunked files
        shutil.rmtree(dataset_path / 'chunked_files')

        # todo - check if this workflow isn't already running
        print("Beginning 'integrated' workflow")
        integrated_wf_body = wf_utils.get_wf_body(wf_name='integrated')
        int_wf = Workflow(celery_app=current_app, **integrated_wf_body)
        api.add_workflow_to_dataset(dataset_id=dataset_id, workflow_id=int_wf.workflow['_id'])
        int_wf.start(dataset_id)

        # Update status of upload log
        try:
            api.update_upload_log(upload_log_id, {
                'status': config['upload_status']['COMPLETE'],
                'increment_processing_count': False
            })
        except Exception as e:
            raise exc.RetryableException(e)
