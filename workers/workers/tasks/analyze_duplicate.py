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
from workers.exceptions import InspectionFailed
from workers import exceptions as exc
from workers.config import config

app = Celery("tasks")
app.config_from_object(celeryconfig)
logger = get_task_logger(__name__)


def analyze_dataset(celery_task, dataset_id, **kwargs):
    logger.info(f"Processing dataset {dataset_id}")

    original_dataset = api.get_dataset(dataset_id=dataset_id, files=True)
    duplicate_datasets = api.get_all_datasets(
        dataset_type=config['dataset_types']['DUPLICATE']['label'],
        name=original_dataset['name'],
        files=True,
    )
    if len(duplicate_datasets) > 1:
        raise InspectionFailed(f"Found more than one duplicates for dataset {dataset_id}")
    duplicate = duplicate_datasets[0]

    original_files = original_dataset['files']
    duplicate_files = duplicate['files']

    are_datasets_same = compare_dataset_files(original_files, duplicate_files)
    logger.info(f"are_datasets_same: {are_datasets_same}")
    if are_datasets_same:
        api.post_action_item({
            "type": "DUPLICATE_INGESTION",
            "dataset_id": dataset_id
        })

    logger.info(f"Processed dataset {dataset_id}")
    return dataset_id,


def compare_dataset_files(files_1, files_2):
    logger.info(f"files_1 length: {len(files_1)}")
    logger.info(f"files_2 length: {len(files_2)}")
    if len(files_1) != len(files_2):
        return False

    are_datasets_same = are_files_same(files_1, files_2)
    return are_datasets_same


def are_files_same(files_1, files_2):
    # logger.info(f"are ids same?: {id(list_1) == id(list_2)}')
    maybe_same = True
    for original in files_1:
        # logger.info(f"processing original: {original['name']}")
        found_original_file = False
        for duplicate in files_2:
            # logger.info(f"processing duplicate: - {duplicate['name']}")
            if original['name'] != duplicate['name']:
                # logger.info("names not same --- continue to next duplicate")
                continue
            else:
                found_original_file = True
                # logger.info(f"found_original_file {original['name']} in list_2")
                # logger.info(f"original_checksum: {original['md5']}")
                # logger.info(f"duplicate_checksum: {duplicate['md5']}")
                checksums_match = original['md5'] == duplicate['md5']
                # logger.info(f"checksums_match: {checksums_match}")
                # logger.info(f"maybe_same: {maybe_same}")
                maybe_same = maybe_same and checksums_match

            if not maybe_same:
                logger.info(f"maybe_same is False, will return False")
                return False

        # logger.info(f"processed original: {original['name']}")

        if not found_original_file:
            logger.info(f"original file {original['name']} not found in list_2")
            return False
    
    logger.info("Returning true")
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


