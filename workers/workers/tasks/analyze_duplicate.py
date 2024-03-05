from __future__ import annotations  # type unions by | are only available in versions >= 3

import itertools
import hashlib
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


def analyze_dataset(celery_task, dataset_id, **kwargs):
    original_dataset = api.get_dataset(dataset_id=dataset_id, files=True)
    duplicate_dataset = api.get_all_datasets(
        dataset_type=config['dataset_types']['DUPLICATE']['label'],
        name=original_dataset['name'],
        include_files=True,
    )

    original_files = original_dataset['files']
    duplicate_files = duplicate_dataset['files']

    return dataset_id, compare_dataset_files(original_files, duplicate_files)


def compare_dataset_files(files_1, files_2):
    if len(files_1) != len(files_2):
        return False

    are_datasets_same = are_files_same(files_1, files_2)
    return are_datasets_same


def are_files_same(files_1, files_2):
    # print(f'are ids same?: {id(list_1) == id(list_2)}')
    maybe_same = True
    for original in files_1:
        # print('processing original:', original)
        found_original_file = False
        for duplicate in files_2:
            # print(f'processing duplicate: {duplicate}')
            if original['name'] != duplicate['name']:
                # print('names not same --- continue to next duplicate')
                continue
            else:
                found_original_file = True
                # print('found_original_file original["name"] in list_2')
                checksums_match = original['md5'] == duplicate['md5']
                # print(f'checksums_match: {checksums_match}')
                maybe_same = maybe_same and checksums_match

            if not maybe_same:
                # print(f'maybe_same is False, will return False')
                return False

        # print('processed original: ', original)

        if not found_original_file:
            return False
    return True


# def update_directory_md5(directory, computed_hash):
#     assert Path(directory).is_dir()
#     for path in sorted(Path(directory).iterdir(), key=lambda p: str(p).lower()):
#         computed_hash.update(path.name.encode())
#         if path.is_file():
#             with open(path, "rb") as f:
#                 for chunk in iter(lambda: f.read(4096), b""):
#                     computed_hash.update(chunk)
#         elif path.is_dir():
#             computed_hash = update_directory_md5(path, computed_hash)
#     return computed_hash
#
#
# def directory_checksum(directory):
#     return update_directory_md5(directory, hashlib.md5()).hexdigest()


