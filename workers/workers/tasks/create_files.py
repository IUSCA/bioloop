from pathlib import Path

from celery import Celery
from celery.utils.log import get_task_logger
from sca_rhythm.progress import Progress

import workers.api as api
import workers.cmd as cmd
import workers.config.celeryconfig as celeryconfig
import workers.utils as utils
from workers import exceptions as exc
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)

def create_dataset_files(celery_task, files_attrs, **kwargs):
    # TODO - file_details should be sent through the HTTP request
    #  that initiates the file merge
    # files_attrs = {
    #     'data_product': 'test',
    #     'files': [{
    #         'file_name': 'file_1.pdf',
    #         'file_hash': '31904f92c817767de2bb7e9241f0f7fc',
    #         'num_chunks': 3
    #     }, {
    #         'file_name': 'file_2.pdf',
    #         'file_hash': '50ddf82278203f3813749b90c77aee24',
    #         'num_chunks': 1
    #     }]
    # }

    # TODO - move path to config
    data_products_upload_dir = Path('/tmp/dataProductUploads')
    data_product = files_attrs['data_product']
    files_details = files_attrs['files']

    for f in files_details:
        source_path = data_products_upload_dir / data_product / f['file_hash']
        file_name = f['file_name']
        merged_file_path = source_path / file_name
        num_chunks_expected = f['num_chunks']
        file_hash = f['file_hash']
        chunks_path = source_path / 'chunks'

        print(f'Processing file {file_name}')
        num_chunk_files = len([p for p in chunks_path.iterdir()])
        if num_chunk_files != num_chunks_expected:
            print(f'Expected {num_chunks_expected} chunks, but found {num_chunk_files}')
            print('This file\'s chunks will not be merged')
            break
        for i in range(num_chunk_files):
            chunk_file = chunks_path / f'{file_hash}-{i}'
            print(f'Processing chunk {chunk_file}')
            print(f'Appending chunk {chunk_file.name} to {merged_file_path}')

            with open(chunk_file, 'rb') as chunk:
                with open(merged_file_path, 'ab') as destination:
                    destination.write(chunk.read())
            print(f'Successfully appended chunk {chunk_file.name} to {merged_file_path}')
            print(f'Deleting chunk {chunk_file}')
            chunk_file.unlink()
