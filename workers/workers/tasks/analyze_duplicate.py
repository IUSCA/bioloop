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


def analyze_dataset(celery_task, duplicate_dataset_id, **kwargs):
    logger.info(f"Processing dataset {duplicate_dataset_id}")

    duplicate_dataset = api.get_dataset(dataset_id=duplicate_dataset_id)
    duplicate_files = api.get_dataset_files(
        dataset_id=duplicate_dataset['id'],
        filters={
            "filetype": "file"
        })

    matching_datasets = api.get_all_datasets(name=duplicate_dataset['name'])
    if len(matching_datasets) > 2:
        raise InspectionFailed(f"Expected 2 datasets named {duplicate_dataset['name']} (original and duplicate), "
                               f"but found more.")

    original_dataset = list(filter(lambda d: d['id'] != duplicate_dataset['id'], matching_datasets))[0]
    original_files = api.get_dataset_files(
        dataset_id=original_dataset['id'],
        filters={
            "filetype": "file"
        })

    are_datasets_same = compare_dataset_files(original_files, duplicate_files)
    logger.info(f"are_datasets_same: {are_datasets_same}")


    if are_datasets_same:
        api.post_ingestion_action_item({
            "type": "DUPLICATE_INGESTION",
            "label": "Duplicate Ingestion",
            "original_dataset_id": original_dataset['id'],
            "duplicate_dataset_id": duplicate_dataset['id'],
            "details": {
                "num_files"
            }
        })

    logger.info(f"Processed dataset {duplicate_dataset_id}")
    return duplicate_dataset_id,


def compare_dataset_files(original_files: list, duplicate_files: list):
    logger.info(f"files_1 length: {len(original_files)}")
    logger.info(f"files_2 length: {len(duplicate_files)}")
    if len(original_files) != len(duplicate_files):
        return False

    are_datasets_same = are_files_same(original_files, duplicate_files)
    return are_datasets_same


def are_files_same(original_files: list, duplicate_files: list):
    # logger.info(f"are ids same?: {id(list_1) == id(list_2)}')
    num_files_same = len(original_files) == len(duplicate_files)
    comparison_results = [{
        'check': 'num_files',
        'status': num_files_same,
        'details': {
            'original_files_count': len(original_files),
            'duplicate_files_count': len(duplicate_files)
        }
    }]

    # maybe_same = True
    checksum_error_files = []
    missing_files = []
    for original in original_files:
        # logger.info(f"processing original: {original['name']}")
        found_file = False
        for duplicate in duplicate_files:
            # logger.info(f"processing duplicate: - {duplicate['name']}")
            if original['path'] != duplicate['path']:
                # logger.info("names not same --- continue to next duplicate")
                continue
            else:
                found_file = True
                checksum_validated = original['md5'] == duplicate['md5']
                # logger.info(f"checksum_validated: {checksum_validated}")
                # logger.info(f"maybe_same: {maybe_same}")
                # maybe_same = maybe_same and checksum_validated
                if not checksum_validated:
                    #     logger.info(f"original['md5']: {original['md5']}")
                    #     logger.info(f"duplicate['md5']: {duplicate['md5']}")
                    checksum_error_files.append({
                        'name': original['name'],
                        'path': original['path'],
                        'original_checksum': original['md5'],
                        'duplicate_checksum': duplicate['md5'],
                    })
                # Once original file has been found, end the loop.
                break
        if not found_file:
            logger.info(f"original file {original['name']} not found in list_2")
            missing_files.append({
                'name': original['name'],
                'path': original['path'],
                'missing': True,
            })

    if len(checksum_error_files) > 0:
        comparison_results.append({
            'check': 'passed_checksum_analysis',
            'status': False,
            'details': checksum_error_files
        })
    if len(missing_files) > 0:
        comparison_results.append({
            'check': 'original_files_missing',
            'status': True,
            'details': missing_files
        })

    return comparison_results


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


